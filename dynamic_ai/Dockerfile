# Dynamic AI for Home Assistant — add-on image.
# Works as a Home Assistant add-on (Supervisor builds this) and as a plain
# container. node:20-alpine is multi-arch, so it builds on aarch64/amd64/armv7.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching). Copy every workspace's
# manifest so npm can resolve the workspace graph.
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install

# Copy the rest of the source and build the frontend.
COPY . .
RUN npm run build

# Runtime config. PORT must match ingress_port in config.yaml.
ENV NODE_ENV=production
ENV PORT=8099
EXPOSE 8099

CMD ["npm", "start"]
