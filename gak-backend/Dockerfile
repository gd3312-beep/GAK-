FROM node:20-bookworm-slim

WORKDIR /app

COPY . .
RUN npm install --omit=dev

ENV NODE_ENV=production
EXPOSE 4000

# If you enable Academia Playwright scraping in containerized production,
# install the required browser/runtime dependencies in your runtime image.
CMD ["node", "server.js"]
