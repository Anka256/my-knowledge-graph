# My Knowledge Graph API

FastAPI + PostgreSQL tabanlı bilgi grafiği API'si.

## Kurulum

### 1. PostgreSQL Veritabanı Oluştur

```bash
# postgres kullanıcısıyla giriş yap
sudo -u postgres psql

# Veritabanı ve kullanıcı oluştur
CREATE DATABASE knowledge_graph;
CREATE USER kg_user WITH PASSWORD 'güçlü_şifre';
GRANT ALL PRIVILEGES ON DATABASE knowledge_graph TO kg_user;
\q
```

### 2. `.env` Dosyasını Düzenle

```env
DATABASE_URL=postgresql+asyncpg://kg_user:güçlü_şifre@localhost:5432/knowledge_graph
```

### 3. Virtual Environment & Bağımlılıklar

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Sunucuyu Başlat

```bash
source venv/bin/activate
uvicorn app.main:app --reload
```

Sunucu `http://127.0.0.1:8000` adresinde çalışır.  
Swagger UI: `http://127.0.0.1:8000/docs`

---

## Endpoint

### `POST /nodes/`

Yeni bir düğüm oluşturur. Uygulama ilk başladığında `nodes` tablosu otomatik olarak oluşturulur.

**İstek gövdesi:**
```json
{
  "name": "Yapay Zeka",
  "content": "Yapay zeka hakkında notlar..."
}
```

**Başarılı yanıt (201 Created):**
```json
{
  "id": 1,
  "name": "Yapay Zeka",
  "content": "Yapay zeka hakkında notlar...",
  "created_at": "2026-06-03T00:10:00+03:00"
}
```

**cURL örneği:**
```bash
curl -X POST http://127.0.0.1:8000/nodes/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Yapay Zeka", "content": "Yapay zeka hakkında notlar..."}'
```

---

## Proje Yapısı

```
my-knowledge-graph/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI uygulaması + lifespan
│   ├── database.py      # Async SQLAlchemy engine & session
│   ├── models.py        # Node ORM modeli
│   ├── schemas.py       # Pydantic şemaları
│   └── routers/
│       ├── __init__.py
│       └── nodes.py     # POST /nodes endpoint
├── .env                 # Veritabanı bağlantı URL'i
├── requirements.txt
└── README.md
```
