import React, { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import loginIcons from '../assest/signin.gif'
import imageTobase64 from '../helpers/imageTobase64'
import { toast } from 'sonner'
import createAccountWithRole from '../helpers/createAccountWithRole';

const AddPartnerModal = ({ isOpen, onClose, onPartnerAdded }) => {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    profilePic: '',
  })

  const handleInputChange = e => {
    const { name, value } = e.target
    setData(prev => ({ ...prev, [name]: value }))
  }

  const handlePicUpload = async e => {
    const file = e.target.files[0]
    if (file) {
      const base64 = await imageTobase64(file)
      setData(prev => ({ ...prev, profilePic: base64 }))
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (data.password !== data.confirmPassword) {
      toast.error('Password and Confirm Password do not match')
      return
    }

    try {
      setLoading(true)
      const result = await createAccountWithRole({
        email: data.email,
        name: data.name,
        password: data.password,
        profilePic: data.profilePic,
      }, 'partner')

      if (result.success) {
        toast.success('Partner added successfully!')
        if (onPartnerAdded) onPartnerAdded(result.data)
        onClose()
        setData({ email: '', name: '', password: '', confirmPassword: '', profilePic: '' })
      } else {
        toast.error(result.message || 'Failed to add partner')
      }
    } catch (error) {
      toast.error('Error adding partner')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">
        <button
          className="absolute top-3 right-4 text-gray-500 hover:text-gray-800 text-xl font-bold"
          onClick={onClose}
        >
          &times;
        </button>
        <h2 className="text-2xl font-semibold mb-6 text-green-700">Add New Partner</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full overflow-hidden mb-3 relative cursor-pointer border-2 border-green-500">
              <img
                src={data.profilePic || loginIcons}
                alt="Profile"
                className="w-full h-full object-cover"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handlePicUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-green-600 font-medium cursor-pointer hover:underline">
              Upload Profile Picture
            </span>
          </div>

          <div>
            <label className="block text-gray-600 font-medium mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={data.name}
              onChange={handleInputChange}
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Enter full name"
            />
          </div>

          <div>
            <label className="block text-gray-600 font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={data.email}
              onChange={handleInputChange}
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <label className="block text-gray-600 font-medium mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={data.password}
                onChange={handleInputChange}
                required
                className="w-full border border-gray-300 rounded-md px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2 text-gray-600 hover:text-green-600"
                tabIndex={-1}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-600 font-medium mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={data.confirmPassword}
                onChange={handleInputChange}
                required
                className="w-full border border-gray-300 rounded-md px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="Confirm password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2 text-gray-600 hover:text-green-600"
                tabIndex={-1}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md transition-colors"
          >
            {loading ? 'Adding Partner...' : 'Add Partner'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AddPartnerModal;