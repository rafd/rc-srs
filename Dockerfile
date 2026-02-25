FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY public ./public
COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
