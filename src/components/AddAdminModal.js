import React, { useState } from 'react';
import { toast } from 'sonner';
import createAccountWithRole from '../helpers/createAccountWithRole';
import imageTobase64 from '../helpers/imageTobase64';
import loginIcons from "../assest/signin.gif";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const AddAdminModal = ({ isOpen, onClose, onAdminAdded }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    
    const [data, setData] = useState({
        email: '',
        password: '',
        name: '',
        confirmPassword: '',
        profilePic: '',
    });

    const handleOnChange = (e) => {
        const { name, value } = e.target;
        setData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleUploadPic = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const imagePic = await imageTobase64(file);
            setData((prev) => ({
                ...prev,
                profilePic: imagePic,
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (data.password !== data.confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        
        try {
            setLoading(true);
            const result = await createAccountWithRole({
                email: data.email,
                password: data.password,
                name: data.name,
                profilePic: data.profilePic,
            }, 'admin');
            
            if (result.success) {
                toast.success("Admin added successfully!");
                
                // Call the onAdminAdded callback with the new admin data
                if (onAdminAdded && result.data) {
                    onAdminAdded(result.data);
                }
                
                // Reset form
                setData({
                    email: '',
                    password: '',
                    name: '',
                    confirmPassword: '',
                    profilePic: '',
                });
                
                onClose(); // Close the modal after submission
            } else {
                toast.error(result.message || "Failed to add admin");
            }
        } catch (error) {
            console.error("Error adding admin:", error);
            toast.error("Failed to add admin");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-white p-5 rounded shadow-lg max-w-md w-full max-h-90vh overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Add New Admin</h2>
                
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <div className="w-20 h-20 mx-auto relative overflow-hidden rounded-full">
                            <img 
                                src={data.profilePic || loginIcons} 
                                alt="Profile" 
                                className="w-full h-full object-cover"
                            />
                            <label className="absolute bottom-0 left-0 right-0 text-xs bg-slate-200 bg-opacity-80 py-1 text-center cursor-pointer">
                                Upload Photo
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleUploadPic} 
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>
                    
                    <div className="mb-3">
                        <label>Name:</label>
                        <div className="bg-slate-200 p-2">
                            <input
                                type="text"
                                name="name"
                                placeholder="Enter name"
                                value={data.name}
                                onChange={handleOnChange}
                                required
                                className="w-full outline-none bg-transparent"
                            />
                        </div>
                    </div>
                    
                    <div className="mb-3">
                        <label>Email:</label>
                        <div className="bg-slate-200 p-2">
                            <input
                                type="email"
                                name="email"
                                placeholder="Enter email"
                                value={data.email}
                                onChange={handleOnChange}
                                required
                                className="w-full outline-none bg-transparent"
                            />
                        </div>
                    </div>
                    
                    <div className="mb-3">
                        <label>Password:</label>
                        <div className="bg-slate-200 p-2 flex">
                            <input
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Enter password"
                                value={data.password}
                                onChange={handleOnChange}
                                required
                                className="w-full outline-none bg-transparent"
                            />
                            <div
                                className="cursor-pointer text-xl"
                                onClick={() => setShowPassword((prev) => !prev)}
                            >
                                <span>
                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mb-4">
                        <label>Confirm Password:</label>
                        <div className="bg-slate-200 p-2 flex">
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                name="confirmPassword"
                                placeholder="Confirm password"
                                value={data.confirmPassword}
                                onChange={handleOnChange}
                                required
                                className="w-full outline-none bg-transparent"
                            />
                            <div
                                className="cursor-pointer text-xl"
                                onClick={() => setShowConfirmPassword((prev) => !prev)}
                            >
                                <span>
                                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex justify-end mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded mr-2"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                            disabled={loading}
                        >
                            {loading ? 'Adding...' : 'Add Admin'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddAdminModal;