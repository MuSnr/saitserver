const mongoose = require("mongoose");
const express = require("express");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    region: { type: String, required: true },
    role: { type: String, required: true, default: "user" },
    password: { type: String, required: true },
  },
  { timestamps: true },
);
const User = mongoose.model("User", userSchema);

module.exports = User;