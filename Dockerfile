FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql

EXPOSE 3000

CMD ["npm", "run", "start"]
