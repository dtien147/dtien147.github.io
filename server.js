const express = require('express');
const cookieParser = require('cookie-parser')
const app = express();
const port = 5000;

app.use(cookieParser());


app.get('/cookie', (req, res) => {
  res.cookie('cookieName', new Date().getTime());
  res.send('Hello World!');
});

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/test2.html');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});