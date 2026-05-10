import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema({

name: String,

description: String,

status:{
type:String,
default:"pending"
}

});

export default mongoose.model("Project", ProjectSchema);