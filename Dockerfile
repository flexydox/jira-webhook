FROM node:24 as base

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the TypeScript code
RUN npm run build

# Use a smaller image for the production stage
FROM node:24-slim as production
# Set the working directory inside the container
WORKDIR /app
# Copy only the necessary files from the build stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/package*.json ./
# Install only production dependencies
RUN npm install --only=production
# Set environment variables
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["node", "dist/index.js"]