const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({

name:{
type:String,
required:true
},

description:{
type:String
},

basePrice:{
type:Number,
required:true
},

createdAt:{
type:Date,
default:Date.now
}

});

module.exports = mongoose.model("Service", serviceSchema);