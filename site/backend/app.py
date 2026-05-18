import os
import json
import pickle
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


# -------------------------------------------------------------------
# Конфигурация и пути
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CKPT_PATH = os.path.join(BASE_DIR, "hybrid_recommender_checkpoint.pth")
USER2IDX_PATH = os.path.join(BASE_DIR, "user2idx.pkl")
ROUTE2IDX_PATH = os.path.join(BASE_DIR, "route2idx.pkl")
IDX2ROUTE_PATH = os.path.join(BASE_DIR, "idx2route.pkl")
USER_PROFILE_PATH = os.path.join(BASE_DIR, "user_profile.parquet")
ROUTE_PROFILE_PATH = os.path.join(BASE_DIR, "route_profile.parquet")

ROUTES_META_PATH = os.path.join(BASE_DIR, "..", "frontend", "routes_meta.csv")

TRAIN_ROUTE_DF_PATH = os.path.join(BASE_DIR, "train_route_df.parquet")
TRAIN_CB_PATH = os.path.join(BASE_DIR, "train_cb.parquet")

FLIGHT_USER_PROFILES_PATH = os.path.join(BASE_DIR, "user_flight_profiles.pkl")
FLIGHT_GLOBAL_DIST_PATH = os.path.join(BASE_DIR, "global_feature_dist.pkl")
FLIGHT_FEATURE_VOCAB_PATH = os.path.join(BASE_DIR, "feature_vocab.pkl")
FLIGHT_CATALOG_PATH = os.path.join(BASE_DIR, "catalog_df.parquet")
FLIGHT_RANKER_CONFIG_PATH = os.path.join(BASE_DIR, "ranker_config.json")

BOOKING_HISTORY_PATH = os.path.join(BASE_DIR, "train_cb.parquet")

device = torch.device("cpu")


# -------------------------------------------------------------------
# Справочник укрупнения классов Aeroflot -> 3 класса
# -------------------------------------------------------------------

BOOKING_CLASS_TO_CABIN = {
    "J": "Бизнес",
    "C": "Бизнес",
    "D": "Бизнес",
    "I": "Бизнес",
    "Z": "Бизнес",
    "F": "Бизнес",
    "P": "Бизнес", 

    "A": "Комфорт",
    "W": "Комфорт",
    "S": "Комфорт",

    "Y": "Эконом",
    "B": "Эконом",
    "M": "Эконом",
    "U": "Эконом",
    "K": "Эконом",
    "H": "Эконом",
    "L": "Эконом",
    "Q": "Эконом",
    "T": "Эконом",
    "E": "Эконом",
    "N": "Эконом",
    "R": "Эконом",
    "V": "Эконом",
    "G": "Эконом",
    "X": "Эконом",
}


# -------------------------------------------------------------------
# Модели
# -------------------------------------------------------------------

class LightGCN(nn.Module):
    def __init__(self, num_nodes: int, emb_dim: int = 128, n_layers: int = 3):
        super().__init__()
        self.num_nodes = num_nodes
        self.emb_dim = emb_dim
        self.n_layers = n_layers
        self.emb = nn.Embedding(num_nodes, emb_dim)
        nn.init.xavier_uniform_(self.emb.weight)

    def forward(self, edge_index: torch.Tensor) -> torch.Tensor:
        x = self.emb.weight
        all_embs = [x]

        row, col = edge_index
        deg = torch.bincount(row, minlength=self.num_nodes).float()
        deg_inv_sqrt = deg.pow(-0.5)
        deg_inv_sqrt[torch.isinf(deg_inv_sqrt)] = 0.0
        norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

        for _ in range(self.n_layers):
            out = torch.zeros_like(x)
            out.index_add_(0, row, x[col] * norm.unsqueeze(1))
            x = out
            all_embs.append(x)

        out = torch.stack(all_embs, dim=0).mean(dim=0)
        return out


class MLPReRanker(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 128, dropout: float = 0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


# -------------------------------------------------------------------
# Глобальные переменные route recommender
# -------------------------------------------------------------------

user2idx: Dict[int, int] = {}
route2idx: Dict[str, int] = {}
idx2route: Dict[int, str] = {}
user_profile: pd.DataFrame = pd.DataFrame()
route_profile: pd.DataFrame = pd.DataFrame()
routes_meta: pd.DataFrame = pd.DataFrame()

lightgcn_model: Optional[LightGCN] = None
reranker: Optional[MLPReRanker] = None

num_users: int = 0
num_routes: int = 0
num_nodes: int = 0
emb_dim: int = 0
n_layers: int = 0
topN_default: int = 50
all_routes: List[str] = []
edge_index: Optional[torch.Tensor] = None

user_emb_mat: Optional[np.ndarray] = None
route_emb_mat: Optional[np.ndarray] = None

seen_routes_map: Dict[int, set] = {}


# -------------------------------------------------------------------
# Глобальные переменные flight reranker
# -------------------------------------------------------------------

flight_user_profiles: Dict[Any, Any] = {}
flight_global_dist: Dict[str, Dict[str, float]] = {}
flight_feature_weights: Dict[str, float] = {}
flight_route_to_candidates: Dict[str, pd.DataFrame] = {}
flight_catalog_df: pd.DataFrame = pd.DataFrame()
flight_feature_vocab: Dict[str, List[str]] = {}
FLIGHT_PROFILE_MIN_PROB: float = 1e-6
FLIGHT_ALPHA_SMOOTH: float = 1.0
flight_feature_cols: List[str] = []


# -------------------------------------------------------------------
# Глобальные переменные preferred cabin
# -------------------------------------------------------------------

booking_history_df: pd.DataFrame = pd.DataFrame()
user_preferred_cabin_map: Dict[str, str] = {}


# -------------------------------------------------------------------
# Вспомогательные функции
# -------------------------------------------------------------------

def load_pickle(path: str):
    with open(path, "rb") as f:
        return pickle.load(f)


def normalize_booking_code(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().upper()


def booking_code_to_cabin(value: Any) -> Optional[str]:
    code = normalize_booking_code(value)
    if not code:
        return None
    return BOOKING_CLASS_TO_CABIN.get(code)


def clean_user_id(value: Any) -> str:
    if pd.isna(value):
        return ""
    s = str(value).strip()
    if s.lower() == "nan":
        return ""
    if s.endswith(".0"):
        s = s[:-2]
    return s


def build_user_preferred_cabin_map(df: pd.DataFrame) -> Dict[str, str]:
    if df.empty:
        return {}

    required_cols = {"passenger_id", "Класс бронирования"}
    if not required_cols.issubset(df.columns):
        print("Нет нужных колонок для preferred_cabin:", df.columns.tolist())
        return {}

    temp = df[["passenger_id", "Класс бронирования"]].copy()

    temp["passenger_id"] = temp["passenger_id"].apply(clean_user_id)
    temp = temp[temp["passenger_id"] != ""]

    temp["booking_code"] = temp["Класс бронирования"].apply(normalize_booking_code)
    temp["cabin"] = temp["booking_code"].map(BOOKING_CLASS_TO_CABIN)

    temp = temp.dropna(subset=["cabin"])

    if temp.empty:
        print("После маппинга booking_code -> cabin не осталось данных")
        return {}

    cabin_counts = (
        temp.groupby(["passenger_id", "cabin"])
        .size()
        .reset_index(name="cnt")
        .sort_values(["passenger_id", "cnt"], ascending=[True, False])
    )

    preferred = (
        cabin_counts.drop_duplicates(subset=["passenger_id"], keep="first")
        .set_index("passenger_id")["cabin"]
        .to_dict()
    )

    preferred = {str(k): str(v) for k, v in preferred.items()}
    return preferred


def get_user_preferred_cabin(user_id: Any) -> str:
    return user_preferred_cabin_map.get(clean_user_id(user_id), "")


# -------------------------------------------------------------------
# Инициализация route recommender
# -------------------------------------------------------------------

def init_models_and_data() -> None:
    global user2idx, route2idx, idx2route
    global user_profile, route_profile, routes_meta
    global lightgcn_model, reranker
    global num_users, num_routes, num_nodes, emb_dim, n_layers, topN_default
    global all_routes, edge_index
    global user_emb_mat, route_emb_mat
    global seen_routes_map

    user2idx = load_pickle(USER2IDX_PATH)
    route2idx = load_pickle(ROUTE2IDX_PATH)
    idx2route = load_pickle(IDX2ROUTE_PATH)

    user_profile = pd.read_parquet(USER_PROFILE_PATH)
    route_profile = pd.read_parquet(ROUTE_PROFILE_PATH)
    routes_meta = pd.read_csv(ROUTES_META_PATH)

    ckpt = torch.load(CKPT_PATH, map_location=device)

    num_users = int(ckpt["num_users"])
    num_routes = int(ckpt["num_routes"])
    num_nodes = int(ckpt["num_nodes"])
    emb_dim = int(ckpt["emb_dim"])
    n_layers = int(ckpt["n_layers"])
    topN_default = int(ckpt.get("topN", 50))
    all_routes = list(ckpt["all_routes"])
    edge_index = ckpt["edge_index"].to(device)

    lgcn = LightGCN(num_nodes=num_nodes, emb_dim=emb_dim, n_layers=n_layers).to(device)
    lgcn.load_state_dict(ckpt["lightgcn_state_dict"])
    lgcn.eval()
    lightgcn_model = lgcn

    rer_input_dim = 1 + emb_dim + 3
    rr = MLPReRanker(input_dim=rer_input_dim, hidden_dim=128, dropout=0.3).to(device)
    rr.load_state_dict(ckpt["reranker_state_dict"])
    rr.eval()
    reranker = rr

    with torch.no_grad():
        all_emb = lightgcn_model(edge_index)
        user_emb_mat = all_emb[:num_users].detach().cpu().numpy()
        route_emb_mat = all_emb[num_users:num_users + num_routes].detach().cpu().numpy()

    if os.path.exists(TRAIN_ROUTE_DF_PATH):
        train_route_df = pd.read_parquet(TRAIN_ROUTE_DF_PATH)
        if {"passenger_id", "route_id"}.issubset(train_route_df.columns):
            seen_routes_map = train_route_df.groupby("passenger_id")["route_id"].apply(set).to_dict()
    elif os.path.exists(TRAIN_CB_PATH):
        train_cb = pd.read_parquet(TRAIN_CB_PATH)
        if "route_id" not in train_cb.columns and "Маршрут" in train_cb.columns:
            train_cb["route_id"] = train_cb["Маршрут"].astype(str)
        if {"passenger_id", "route_id"}.issubset(train_cb.columns):
            seen_routes_map = train_cb.groupby("passenger_id")["route_id"].apply(set).to_dict()
    else:
        seen_routes_map = {}

    print("Hybrid route recommender initialized")
    print("num_users:", num_users, "num_routes:", num_routes, "emb_dim:", emb_dim)


# -------------------------------------------------------------------
# Инициализация flight reranker
# -------------------------------------------------------------------

def init_flight_ranker() -> None:
    global flight_user_profiles, flight_global_dist, flight_feature_weights
    global flight_route_to_candidates, flight_catalog_df, flight_feature_vocab
    global FLIGHT_PROFILE_MIN_PROB, FLIGHT_ALPHA_SMOOTH, flight_feature_cols

    required_files = [
        FLIGHT_USER_PROFILES_PATH,
        FLIGHT_GLOBAL_DIST_PATH,
        FLIGHT_FEATURE_VOCAB_PATH,
        FLIGHT_CATALOG_PATH,
        FLIGHT_RANKER_CONFIG_PATH,
    ]

    missing = [p for p in required_files if not os.path.exists(p)]
    if missing:
        print("Flight ranker files not found:")
        for p in missing:
            print(" -", p)
        flight_user_profiles = {}
        flight_global_dist = {}
        flight_feature_weights = {}
        flight_route_to_candidates = {}
        flight_catalog_df = pd.DataFrame()
        flight_feature_vocab = {}
        return

    with open(FLIGHT_USER_PROFILES_PATH, "rb") as f:
        flight_user_profiles = pickle.load(f)

    with open(FLIGHT_GLOBAL_DIST_PATH, "rb") as f:
        flight_global_dist = pickle.load(f)

    with open(FLIGHT_FEATURE_VOCAB_PATH, "rb") as f:
        flight_feature_vocab = pickle.load(f)

    with open(FLIGHT_RANKER_CONFIG_PATH, "r", encoding="utf-8") as f:
        ranker_config = json.load(f)

    flight_catalog_df = pd.read_parquet(FLIGHT_CATALOG_PATH)
    flight_feature_weights = ranker_config["feature_weights"]
    flight_feature_cols = ranker_config["flight_feature_cols"]
    FLIGHT_PROFILE_MIN_PROB = float(ranker_config["profile_min_prob"])
    FLIGHT_ALPHA_SMOOTH = float(ranker_config["alpha_smooth"])

    if "route_id" not in flight_catalog_df.columns and "Маршрут" in flight_catalog_df.columns:
        flight_catalog_df["route_id"] = flight_catalog_df["Маршрут"].astype(str)

    if "flight_id" in flight_catalog_df.columns:
        flight_catalog_df["flight_id"] = flight_catalog_df["flight_id"].astype(str)

    flight_catalog_df["route_id"] = flight_catalog_df["route_id"].astype(str)

    flight_route_to_candidates = {
        route_id: grp.reset_index(drop=True)
        for route_id, grp in flight_catalog_df.groupby("route_id")
    }

    print("Flight reranker initialized")
    print("n flight users:", len(flight_user_profiles))
    print("n flight routes:", len(flight_route_to_candidates))
    print("n flight rows:", len(flight_catalog_df))


# -------------------------------------------------------------------
# Инициализация preferred cabin
# -------------------------------------------------------------------

def init_booking_history() -> None:
    global booking_history_df, user_preferred_cabin_map

    if not os.path.exists(BOOKING_HISTORY_PATH):
        print("Booking history file not found:", BOOKING_HISTORY_PATH)
        booking_history_df = pd.DataFrame()
        user_preferred_cabin_map = {}
        return

    booking_history_df = pd.read_parquet(BOOKING_HISTORY_PATH)

    print("BOOKING_HISTORY columns:", booking_history_df.columns.tolist())
    print("BOOKING_HISTORY shape:", booking_history_df.shape)

    user_preferred_cabin_map = build_user_preferred_cabin_map(booking_history_df)

    print("users with preferred cabin:", len(user_preferred_cabin_map))
    print("sample preferred cabins:", list(user_preferred_cabin_map.items())[:10])


# -------------------------------------------------------------------
# Route recommender inference
# -------------------------------------------------------------------

def get_user_emb_array(u: int) -> np.ndarray:
    if u not in user2idx:
        return np.zeros((emb_dim,), dtype=np.float32)
    return user_emb_mat[user2idx[u]]


def get_route_emb_array(r: str) -> np.ndarray:
    if r not in route2idx:
        return np.zeros((emb_dim,), dtype=np.float32)
    return route_emb_mat[route2idx[r]]


def get_lightgcn_scores_for_user(u_id: int) -> Optional[np.ndarray]:
    if u_id not in user2idx:
        return None
    u_vec = user_emb_mat[user2idx[u_id]]
    scores = route_emb_mat @ u_vec
    return scores.astype(np.float32)


def build_pair_features_for_user_and_routes(u_id: int, candidate_routes: List[str]) -> np.ndarray:
    u_vec = get_user_emb_array(u_id)
    feats = []
    for r in candidate_routes:
        r_vec = get_route_emb_array(r)
        dot = np.dot(u_vec, r_vec)
        abs_diff = np.abs(u_vec - r_vec)
        feats.append(np.concatenate([[dot], abs_diff], axis=0))
    return np.stack(feats).astype(np.float32)


def predict_reranker_scores_for_user(u_id: int, candidate_routes: List[str]) -> np.ndarray:
    up = user_profile[user_profile["passenger_id"] == u_id]

    if up.empty:
        age = 0.0
        n_unique = 0.0
        total_bookings = 0.0
    else:
        def safe_get(col: str) -> float:
            if col not in up.columns:
                return 0.0
            val = pd.to_numeric(up[col].iloc[0], errors="coerce")
            if pd.isna(val):
                return 0.0
            return float(val)

        age = safe_get("Возраст")
        n_unique = safe_get("n_unique_routes")
        total_bookings = safe_get("user_total_bookings")

    pair_feats = build_pair_features_for_user_and_routes(u_id, candidate_routes)
    num_feats = np.array([age, n_unique, total_bookings], dtype=np.float32)
    num_mat = np.tile(num_feats.reshape(1, -1), (len(candidate_routes), 1))

    X_user = np.concatenate([pair_feats, num_mat], axis=1)
    X_user_t = torch.tensor(X_user, dtype=torch.float32, device=device)

    reranker.eval()
    with torch.no_grad():
        logits = reranker(X_user_t)
        probs = torch.sigmoid(logits).detach().cpu().numpy()

    return probs.astype(np.float32)


def recommend_routes_for_user(
    user_id: int,
    top_k: int = 9,
    topN_candidates: int = 50,
    filter_seen: bool = True,
) -> pd.DataFrame:
    user_id = int(user_id)

    if user_id not in user2idx:
        return pd.DataFrame(columns=[
            "passenger_id", "route_id", "route_label",
            "from_city", "to_city",
            "lightgcn_score", "reranker_score", "final_rank",
        ])

    scores = get_lightgcn_scores_for_user(user_id)
    if scores is None:
        return pd.DataFrame(columns=[
            "passenger_id", "route_id", "route_label",
            "from_city", "to_city",
            "lightgcn_score", "reranker_score", "final_rank",
        ])

    route_score_pairs = list(zip(all_routes, scores))

    if filter_seen and user_id in seen_routes_map:
        seen = seen_routes_map[user_id]
        route_score_pairs = [(r, s) for r, s in route_score_pairs if r not in seen]

    route_score_pairs.sort(key=lambda x: x[1], reverse=True)
    candidate_pairs = route_score_pairs[:topN_candidates]

    if len(candidate_pairs) == 0:
        return pd.DataFrame(columns=[
            "passenger_id", "route_id", "route_label",
            "from_city", "to_city",
            "lightgcn_score", "reranker_score", "final_rank",
        ])

    candidate_routes = [r for r, _ in candidate_pairs]
    lightgcn_score_map = {r: float(s) for r, s in candidate_pairs}

    rerank_scores = predict_reranker_scores_for_user(user_id, candidate_routes)
    rerank_order = np.argsort(-rerank_scores)

    reranked_routes = [candidate_routes[i] for i in rerank_order][:top_k]
    reranked_scores = [float(rerank_scores[i]) for i in rerank_order][:top_k]

    recs = pd.DataFrame({
        "passenger_id": [str(user_id)] * len(reranked_routes),
        "route_id": reranked_routes,
        "reranker_score": reranked_scores,
    })

    recs["lightgcn_score"] = recs["route_id"].map(lightgcn_score_map)

    meta = routes_meta.rename(columns={
        "Город вылета": "from_city",
        "Город прилета": "to_city",
    }).copy()

    if "route_label" not in meta.columns:
        meta["route_label"] = (
            meta["from_city"].astype(str) + " → " + meta["to_city"].astype(str)
        )

    recs = recs.merge(
        meta[["route_label", "from_city", "to_city"]].drop_duplicates(),
        left_on="route_id",
        right_on="route_label",
        how="left",
    )

    recs["final_rank"] = np.arange(1, len(recs) + 1)

    recs = recs[[
        "passenger_id", "route_id", "route_label",
        "from_city", "to_city",
        "lightgcn_score", "reranker_score", "final_rank",
    ]]

    return recs


# -------------------------------------------------------------------
# Flight reranker inference
# -------------------------------------------------------------------

def score_flight(
    user_id,
    flight_row,
    user_profiles,
    global_dist,
    weights,
    profile_min_prob=1e-6
):
    user_id_str = clean_user_id(user_id)

    prof = user_profiles.get(user_id_str, None)
    if prof is None:
        prof = user_profiles.get(user_id, None)

    score = 0.0

    for col, w in weights.items():
        val = str(flight_row.get(col, "UNK"))

        if prof is None:
            p = global_dist.get(col, {}).get(val, profile_min_prob)
        else:
            p = prof.get(col, {}).get(val, profile_min_prob)

        p = max(p, profile_min_prob)
        score += w * np.log(p)

    return float(score)


def recommend_flights_for_selected_route(
    user_id,
    route_id,
    route_to_candidates,
    user_profiles,
    global_dist,
    weights,
    top_k=9,
    profile_min_prob=1e-6
):
    route_id = str(route_id).strip()
    candidates = route_to_candidates.get(route_id, None)

    if candidates is None or len(candidates) == 0:
        return pd.DataFrame()

    ranked = candidates.copy()
    ranked["score"] = ranked.apply(
        lambda row: score_flight(
            user_id=user_id,
            flight_row=row,
            user_profiles=user_profiles,
            global_dist=global_dist,
            weights=weights,
            profile_min_prob=profile_min_prob
        ),
        axis=1
    )

    ranked = ranked.sort_values("score", ascending=False).reset_index(drop=True)
    return ranked.head(top_k)


# -------------------------------------------------------------------
# Lifespan
# -------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_models_and_data()
    init_flight_ranker()
    init_booking_history()
    yield


app = FastAPI(
    title="AFL SKY Hybrid Recommender API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------

@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "num_users": num_users,
        "num_routes": num_routes,
        "flight_ranker_routes": len(flight_route_to_candidates),
        "users_with_preferred_cabin": len(user_preferred_cabin_map),
    }


@app.get("/api/recommend_routes")
def api_recommend_routes(
    user_id: str,
    top_k: int = 9,
    filter_seen: bool = True,
) -> Dict[str, Any]:
    try:
        user_id_int = int(clean_user_id(user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    if user_id_int not in user2idx:
        raise HTTPException(status_code=404, detail="User ID not found in training set")

    recs = recommend_routes_for_user(
        user_id=user_id_int,
        top_k=top_k,
        topN_candidates=topN_default,
        filter_seen=filter_seen,
    )

    routes = recs.to_dict(orient="records")

    return {
        "user_id": clean_user_id(user_id),
        "top_k": top_k,
        "routes": routes,
    }


@app.get("/api/recommend_flights")
def api_recommend_flights(
    user_id: str,
    route_id: str,
    top_k: int = 9
) -> Dict[str, Any]:
    if not flight_route_to_candidates:
        raise HTTPException(status_code=500, detail="Flight ranker is not initialized")

    user_id_clean = clean_user_id(user_id)

    ranked = recommend_flights_for_selected_route(
        user_id=user_id_clean,
        route_id=route_id,
        route_to_candidates=flight_route_to_candidates,
        user_profiles=flight_user_profiles,
        global_dist=flight_global_dist,
        weights=flight_feature_weights,
        top_k=top_k,
        profile_min_prob=FLIGHT_PROFILE_MIN_PROB
    )

    preferred_cabin = ""

    if not ranked.empty and "Класс бронирования" in ranked.columns:
        tmp = ranked["Класс бронирования"].dropna().astype(str).str.strip().str.upper()

        if not tmp.empty:
            most_frequent_booking_code = tmp.value_counts().idxmax()
            preferred_cabin = BOOKING_CLASS_TO_CABIN.get(most_frequent_booking_code, "")

    flights = ranked.to_dict(orient="records") if not ranked.empty else []

    return {
        "user_id": user_id_clean,
        "route_id": route_id,
        "top_k": top_k,
        "preferred_cabin": preferred_cabin,
        "flights": flights,
    }