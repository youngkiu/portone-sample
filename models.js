const Schema = require('mongoose').Schema;
const mongoose= require("mongoose");

const UserSchema = new mongoose.Schema({
  vbank_num: {
    type: String,
  },
  vbank_date: {
    type: Number,
  },
  vbank_name: {
    type: String,
  },
});
const User = mongoose.model("User", UserSchema);

const OrderSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  user: {
    type: Schema.ObjectId,
    ref: "User",
    required: true,
  },
});
const Order = mongoose.model("Order", OrderSchema);

module.exports = { User, Order };
