FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

RUN npx prisma generate
RUN npx tsc --outDir dist

FROM node:20-alpine

RUN apk add --no-cache wget openssl

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh ./

RUN chmod +x entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
