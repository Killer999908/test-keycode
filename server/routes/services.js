const express = require("express");
const router = express.Router();

const Service = require("../models/service");


// GET ALL SERVICES
router.get("/", async(req,res)=>{

const services = await Service.find();

res.json(services);

});


// ADD SERVICE
router.post("/add", async(req,res)=>{

const {name,description,basePrice} = req.body;

const newService = new Service({

name,
description,
basePrice

});

await newService.save();

res.json({message:"Service added"});

});


// DELETE SERVICE
router.delete("/:id", async(req,res)=>{

await Service.findByIdAndDelete(req.params.id);

res.json({message:"Service deleted"});

});


module.exports = router;