# Label Forge

**Label Forge** là một ứng dụng demo mô phỏng nền tảng anotate ảnh kiểu Roboflow. Mục tiêu của dự án là xây dựng một hệ thống annotation workflow production-ready với:

- Frontend: **Next.js 16 (App Router)** + **Tailwind CSS**
- Backend: **FastAPI** + **Python 3.11**
- Database: **MongoDB**
- Cache / Queue: **Redis**
- Storage: **MinIO** (S3-compatible)
- Reverse proxy: **Nginx**

Ứng dụng hỗ trợ:

- Đăng ký / đăng nhập với JWT
- Quản lý workspace, project và thành viên
- Upload hình ảnh, gán split train/valid/test
- Annotation mock với lưu dữ liệu thực
- Quản lý dataset version và health check
- Mô phỏng training + deploy workflow

---

## Kiến trúc tổng thể

```
Browser (Next.js)
    │
    ▼
Nginx (reverse proxy)
    ├──► /api/*  ──►  FastAPI
    │                    ├── MongoDB
    │                    ├── Redis
    │                    └── MinIO
    └──► /*      ──►  Next.js
```

### Tại sao chọn các thành phần này

- **Next.js 16**: App Router cho trải nghiệm SPA + SSR tốt hơn và cấu trúc module rõ ràng.
- **FastAPI**: Async, tốc độ cao, dễ mở rộng và tự động sinh tài liệu OpenAPI.
- **MongoDB**: Phù hợp với dữ liệu annotation linh hoạt và mở rộng tốt.
- **Redis**: Cache, session, queue và rate limiting.
- **Nginx**: Reverse proxy, phục vụ tĩnh và chuẩn bị dễ dàng cho triển khai production.
- **MinIO**: Local storage S3-compatible, dễ chuyển sang AWS S3 khi deploy.

---

## Tính năng chính

- Authentication JWT với refresh token
- Workspace và project management
- Upload ảnh batch với preview
- Gallery ảnh + filter split/status
- Annotation mock và lưu dữ liệu annotation thực
- Dataset version generation với config preprocessing/augmentation
- Health check project metrics
- Mock training job và deploy flow
- Rate limiting và error handling backend
- Responsive UI với Tailwind CSS

---

## Cấu trúc dự án

```
.
├── backend/
│   ├── app/
│   │   ├── core/           # Cấu hình, database, Redis, MinIO
│   │   ├── models/         # Pydantic schema
│   │   ├── routers/        # API endpoints
│   │   ├── services/       # Business logic và background tasks
│   │   └── utils/          # Helpers chung
│   ├── Dockerfile.dev
│   ├── requirements.txt
│   └── seed_data.py
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router pages + layouts
│   │   ├── components/     # UI components
│   │   ├── contexts/       # React context
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # API client, auth helpers
│   │   └── types/          # Shared TypeScript types
│   ├── Dockerfile.dev
│   ├── package.json
│   └── tailwind.config.ts
├── nginx/
│   ├── conf.d/default.conf
│   └── Dockerfile.dev
├── docker-compose.yml
└── README.md
```

---

## Chạy dự án local

1. Cài Docker Desktop và bật Docker.
2. Mở terminal ở thư mục gốc.
3. Chạy:

```bash
docker compose up --build
```

4. Truy cập:

- App qua Nginx: `http://localhost:3330`
- Frontend trực tiếp: `http://localhost:3333`
- API trực tiếp: `http://localhost:8888/api`
- MinIO Console: `http://localhost:9001`

---

## Biến môi trường chính

File `.env` cần chứa các biến sau:

- `MONGO_URI`
- `MONGO_DB_NAME`
- `REDIS_URL`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_NAME`
- `JWT_SECRET`
- `JWT_ALGORITHM=HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES=10080`
- `NEXT_PUBLIC_API_URL=http://localhost:8888/api`

---

## Hướng dẫn phát triển

- Backend chạy với `uvicorn --reload` trong Docker development.
- Frontend chạy với `next dev` trong Docker development.
- Nginx định tuyến `/api/*` đến backend và tất cả route còn lại đến frontend.
- MongoDB lưu trữ dữ liệu ứng dụng, Redis dùng cache/session/job, MinIO lưu ảnh.

---

## Ghi chú

- Đây là một bản demo học tập / prototype, không phải hệ thống production hoàn chỉnh.
- MinIO được dùng ở môi trường local, có thể thay bằng AWS S3 cho production.
- Annotation canvas hiện tại mô phỏng giao diện, dữ liệu annotation vẫn được giữ lại.

---

## Liên hệ

Nếu cần mở rộng thêm tính năng hoặc chuyển sang triển khai production, bạn có thể tham khảo thêm các mục:

- Rate limiting
- Logging / observability
- Sentry / monitoring
- CI/CD và test tự động

---

*Label Forge — Prototype annotation platform built with Next.js + FastAPI + MongoDB + Redis + MinIO + Nginx*
