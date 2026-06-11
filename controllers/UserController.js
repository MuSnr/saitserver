const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

dotenv.config();
const createAccount = async(req,res)=>{
    try{
        const {name,email,role,region,password} = req.body;
        if(!name || !email || !password){
            return res.status(400).json({message: 'All fields are required',success:false});
        }else{
            const existingUser = await User.findOne({email});
            if(existingUser){
                return res.status(400).json({message: 'Email already in use',success:false});
            }else{
                const hashedPassword = await bcrypt.hash(password, 10);
                const newUser = new User({
                    name,
                    email,
                    role: role || 'user',
                    region,
                    password: hashedPassword
                });
                await newUser.save();
                return res.status(201).json({message: 'Account created successfully',success:true});
            }
        }

    }catch(error){
        return res.status(500).json({message: 'Server error',success:false});
    }
}


// get users
const getUsers = async(req,res)=>{
    try{
        const users = await User.find();
        return res.status(200).json({message:"Users retrieved successfully",success:true,users})
        
    }catch(error){
        return res.status(500).json({message:"error while getting users",success:false})
    }
}

const Login = async(req,res)=>{
    try{
        const {email,password} = req.body;
        const exists = await User.findOne({email}).select("+password");

        if(!exists){
            res.status(400).json({message:"User with this account does not exist",success:false})
        }else{
            const checkpass = await bcrypt.compare(password,exists.password);
            if(!checkpass){
                res.status(400).json({message:"Incorrect password",success:false})
            }else{
                const token = jwt.sign({id:exists._id},process.env.JWT_SECRET,{expiresIn:"1d"});
                res.status(200).json({message:"Login successful",success:true,user:exists,token})
            }
        }
    }catch(error){
        return res.status(500).json({message:"error while logging in",success:false})
    }
}

module.exports = {
    createAccount,
    getUsers,
    Login
}