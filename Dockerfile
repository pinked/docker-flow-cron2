FROM node:alpine
ENV DF_UPDATE_SCHEDULE 5 5 * * * *
RUN mkdir /app
WORKDIR /app
COPY package.json .
RUN npm install -s --prod
COPY . .

CMD npm start