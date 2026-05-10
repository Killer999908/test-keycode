import { estimateProject } from "../aiEstimator.js";
import express from "express";
import Project from "../models/Project.js";

const router = express.Router();


// GET all projects
router.get("/", async(req,res)=>{

const projects = await Project.find();

res.json(projects);

});


// CREATE project
router.post("/", async(req,res)=>{

try{

const project = new Project({

name:req.body.name,
description:req.body.description

});

await project.save();

res.json(project);

}catch(err){

res.status(500).json(err);

}

});


// UPDATE project status
router.put("/:id", async(req,res)=>{

try{

await Project.findByIdAndUpdate(req.params.id,{
status:"completed"
});

res.json({message:"Project updated"});

}catch(err){

res.status(500).json(err);

}

});

export default router;

router.post("/", async(req,res)=>{

try{

const description = req.body.description;

const estimate = estimateProject(description);

const project = new Project({

name: estimate.type,
description: description,
status: "pending"

});

await project.save();

res.json({

message:"Project created",
estimate: estimate,
project: project

});

}catch(err){

res.status(500).json(err);

}

});