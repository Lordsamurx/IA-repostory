# ---------- 1) build da interface e do worker ----------
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Variáveis públicas do Supabase entram no build (a chave anon é pública por design)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------- 2) servidor ----------
FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 STATIC_DIR=/app/dist
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /app/dist /app/dist
# worker de automação (chatbot, IA, follow-ups, disparos e WhatsApp), empacotado no build da interface
COPY --from=web /app/server/worker ./worker
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "index.mjs"]
