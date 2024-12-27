FROM apify/actor-node-puppeteer-chrome:latest

COPY . ./

RUN npm install --quiet --only=prod --no-optional && (npm list || true)

CMD ["npm", "start"]
