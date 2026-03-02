FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# If you enable Academia Playwright scraping in containerized production,
# install the required browser/runtime dependencies in your runtime image.
CMD ["node", "server.js"]
