FROM node:22-alpine

WORKDIR /app

EXPOSE 5173

CMD ["sh", "-c", "if [ ! -f node_modules/.package-lock.json ]; then npm install; fi && npm run dev -- --host 0.0.0.0"]
