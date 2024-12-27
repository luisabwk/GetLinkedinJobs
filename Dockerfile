FROM apify/actor-node-puppeteer-chrome:latest

COPY package*.json ./

RUN npm install --quiet --only=prod

COPY . ./

CMD ["npm", "start"]
