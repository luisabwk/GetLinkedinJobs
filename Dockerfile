FROM apify/actor-node-puppeteer-chrome:latest

# Copy all files into the Docker image
COPY . ./

# Install production dependencies
RUN npm install --quiet --only=prod --no-optional && (npm list || true)

# Specify the main file to execute
CMD ["npm", "start"]
