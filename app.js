require("dotenv").config();
require("./database/connection");

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const quizzRoutes = require('./routes/quizz');
const locationRoutes = require('./routes/location');
const duelRoutes = require('./routes/duels');

const app = express();

// Middlewares en premier
app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes API ensuite
app.use('/duels', duelRoutes);
app.use('/users', locationRoutes)
app.use('/quizz', quizzRoutes);
app.use("/users", usersRouter);
app.use("/", indexRouter);



module.exports = app;
