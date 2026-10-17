import React, { useEffect, useState, useRef } from 'react';
import { X, Upload, Send, FileText, Image } from 'lucide-react';
import SummaryApi from '../common';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression'; // You'll need to install this package
import Modal from './Modal';
import GlassButton from './GlassButton';
import { startUploadTiming } from '../utils/uploadTiming';
import { useUploads } from '../context/UploadContext';

const LEGACY_MAX_FILE_COUNT = 20;
// A project's own per-request cap, matching backend/config/uploadLimits.js
// (MAX_PROJECT_FILES_PER_UPLOAD). A project used to fall back to the legacy number
// because no service was selected, so it advertised "Maximum 20 files" — a legacy
// plan's allowance shown on something that has no plan behind it at all.
const PROJECT_MAX_FILE_COUNT = 100;

const UpdateRequestModal = ({ plan, onClose, onSubmitSuccess }) => {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { startUpload } = useUploads();
  const [uploadServices, setUploadServices] = useState(plan?.isServicePlan ? [plan] : []);
  const [selectedServiceId, setSelectedServiceId] = useState(plan?.isServicePlan ? plan._id : '');
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);

  // Which kind of upload is this? The same three-way answer the server gives
  // (backend/helpers/uploadType.js), read from the same two flags on the order, so the
  // modal and the controller cannot disagree about what is being uploaded against.
  const isProjectUpload = !plan?.isServicePlan && plan?.isWebsiteProject === true;

  useEffect(() => {
    if (plan?.isServicePlan) return;
    // A project uploads against ITSELF. Its portal access during development is
    // unlimited — it has no service to spend and none to pick. Borrowing one here is
    // what made a project upload land on an unrelated service order, spending that
    // service's allowance and reporting that service's limits back to the customer.
    if (isProjectUpload) return;
    fetch(SummaryApi.ordersList.url, { credentials: 'include' }).then((response) => response.json()).then((result) => {
      const services = (result.data || []).filter((order) => order.isServicePlan && order.servicePlanStatus === 'active' && (order.servicePlanSnapshot?.capability === 'upload_data' || order.servicePlanSnapshot?.serviceBehavior === 'portal_access_control'));
      setUploadServices(services);
      setSelectedServiceId(services[0]?._id || '');
    }).catch(() => toast.error('Could not load upload services.'));
  }, [plan, isProjectUpload]);
  const selectedService = uploadServices.find((service) => service._id === selectedServiceId) || null;
  // Each kind states its own cap: a service's is frozen on its order, a project has its
  // own, and only a legacy plan uses the legacy number.
  const maxFileCount = Number(
    selectedService?.servicePlanSnapshot?.filesLimit
      || (isProjectUpload ? PROJECT_MAX_FILE_COUNT : LEGACY_MAX_FILE_COUNT)
  );

  // File upload handling
  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files);
    const preparationTiming = startUploadTiming('portal_file_preparation', {
      fileCount: uploadedFiles.length, fileBytes: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
    });
    const maxFileSize = 5 * 1024 * 1024; // 5MB in bytes
    // Check if adding these files would exceed the limit
    if (files.length + uploadedFiles.length > maxFileCount) {
      preparationTiming.finish('file_count_rejected');
      toast.error(`Maximum ${maxFileCount} files allowed. You already have ${files.length} file${files.length !== 1 ? 's' : ''} uploaded.`);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    // Validate file types and sizes
    const validFiles = [];
    const invalidFiles = [];
    
    uploadedFiles.forEach(file => {
      // Check file size first
      if (file.size > maxFileSize) {
        invalidFiles.push({ name: file.name, reason: 'size' });
        return;
      }
      
      // Check file type
      const isValidImage = file.type.startsWith('image/jpeg') || file.type.startsWith('image/jpg');
      const isValidDocument = file.type === 'text/plain' || 
                              file.type === 'application/rtf' || 
                              file.type === 'application/pdf' || 
                              file.type === 'application/msword' || 
                              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      
      if (isValidImage || isValidDocument) {
        validFiles.push(file);
      } else {
        invalidFiles.push({ name: file.name, reason: 'type' });
      }
    });
    
    // Show error messages for invalid files
    if (invalidFiles.length > 0) {
      const sizeErrors = invalidFiles.filter(file => file.reason === 'size');
      const typeErrors = invalidFiles.filter(file => file.reason === 'type');
      
      if (sizeErrors.length > 0) {
        toast.error(`${sizeErrors.length > 1 ? 'Some files exceed' : 'File exceeds'} the 5MB size limit`);
      }
      
      if (typeErrors.length > 0) {
        toast.error('Only JPG, PDF, DOC, RTF and TXT files are supported');
      }
    }
    
    // Process and add valid files
    const processedFiles = await Promise.all(
      validFiles.map(async (file) => {
        // If it's an image, compress it
        if (file.type.startsWith('image/')) {
          try {
            const options = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true
            };
            
            const compressedFile = await imageCompression(file, options);
            
            return {
              file: compressedFile,
              name: file.name,
              type: file.type,
              size: compressedFile.size,
              preview: URL.createObjectURL(compressedFile)
            };
          } catch (error) {
            console.error('Error compressing image:', error);
            toast.error(`Failed to compress ${file.name}`);
            return null;
          }
        }
        
        // For documents, just add them
        return {
          file,
          name: file.name,
          type: file.type,
          size: file.size,
          preview: null
        };
      })
    );
    
    // Filter out any null values (failed processing)
    const successfullyProcessed = processedFiles.filter(file => file !== null);
    preparationTiming.finish(successfullyProcessed.length === uploadedFiles.length ? 'prepared' : 'partially_rejected');
    
    setFiles(prevFiles => [...prevFiles, ...successfullyProcessed]);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const removeFile = (index) => {
    setFiles(prevFiles => {
      const newFiles = [...prevFiles];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };
  
  // Message handling
  const sendMessage = () => {
    if (!message.trim()) return;
    
    setMessages(prev => [...prev, { 
      text: message.trim(),
      timestamp: new Date()
    }]);
    
    setMessage('');
    
    // Focus back on input after sending
    if (messageInputRef.current) {
      messageInputRef.current.focus();
    }
  };
  
  // Final submission
  // Modified submitUpdateRequest function for UpdateRequestModal.js
  const submitUpdateRequest = () => {
    if (loading) return;
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('planId', selectedService?._id || plan._id);
      if (selectedService) formData.append('serviceOrderId', selectedService._id);
      formData.append('instructions', JSON.stringify(messages));
      files.forEach(file => formData.append('files', file.file, file.name));
      startUpload({
        url: SummaryApi.requestUpdate.url,
        sessionUrl: SummaryApi.uploadSessions.url,
        progressUrl: SummaryApi.uploadProgress.url,
        formData, surface: 'portal', label: 'Your data submission',
        totalFiles: files.length, fileBytes: files.reduce((sum, file) => sum + file.file.size, 0),
        onSuccess: () => onSubmitSuccess?.(),
      });
      files.forEach(file => { if (file.preview) URL.revokeObjectURL(file.preview); });
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not start the upload');
      setLoading(false);
    }
  };
  
// Update the file icons to handle new file types
const getFileIcon = (fileType) => {
  const chip = 'w-10 h-10 p-2 mr-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] flex-shrink-0';
  if (fileType.startsWith('image/')) {
    return <Image className={`${chip} text-[var(--text-secondary)]`} />;
  } else if (fileType === 'application/pdf') {
    // Was `text-rose-300` — 5.42 on the dark chip but 1.84 on the light one, so the
    // PDF icon vanished in light mode. --danger-fg is the portal's per-theme red and
    // keeps the same "this one is a PDF" cue in all three (7.09 dark / 6.29 light).
    return <FileText className={`${chip} text-[var(--danger-fg)]`} />;
  } else if (fileType === 'application/msword' ||
             fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // `text-sky-300` measured 1.62 on the light chip. Blue is not in the portal's
    // palette at all (see Modal.js's note on the bg-blue-600 header bar it replaced),
    // so the Word icon takes the neutral text colour rather than inventing a token.
    return <FileText className={`${chip} text-[var(--text-secondary)]`} />;
  } else {
    return <FileText className={`${chip} text-[var(--text-secondary)]`} />;
  }
};


  return (
    // The dialog used to be a hand-built pair of divs: an outer frame filled with a
    // hardcoded radial green gradient ("the mockup's .scene") and, floating on it, an
    // inner panel fixed at rgba(20,26,32,0.55). Neither followed the theme, but every
    // piece of text inside them did — so on the light theme the scene stayed dark while
    // --text-primary/--text-secondary turned dark slate on top of it, measuring 1.18:1
    // and 1.47:1. The body was effectively invisible; only the header escaped, by the
    // accident of sitting under the light sheen.
    //
    // Owner's decision (15-09-2026): the scene follows the theme. That makes it exactly
    // what Modal already is — a Surface panel over the shared backdrop, measured at
    // 14.0:1 dark and 16.1:1 light — so the gradient is dropped rather than re-expressed
    // as a new token, and the dialog inherits Escape-to-close and the scroll lock it
    // never had. Modal renders its own header from `title`/`onClose`, so the hand-built
    // header row and close button go with it.
    <Modal open onClose={loading ? undefined : onClose} title="Upload Data" size="lg">
        {showConfirmation ? (
          /* Confirmation Screen */
          <div className="relative flex-1 overflow-auto p-6 flex flex-col items-center">
            <div className="text-center mb-6">
              <h4 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Confirm Update Request</h4>
              <p className="text-[var(--text-secondary)]">
                You're about to use 1 of your available monthly updates. This action cannot be undone.
              </p>
            </div>

            <div className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 mb-6">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-3">Summary</h5>
              <div className="divide-y divide-[var(--divider)]">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--text-secondary)]">Plan</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{plan.productId?.serviceName}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--text-secondary)]">Files</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{files.length} files uploaded</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--text-secondary)]">Instructions</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{messages.length} messages</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-auto">
              <GlassButton
                strong
                onClick={() => setShowConfirmation(false)}
                className="disabled:opacity-50"
                disabled={loading}
              >
                Back
              </GlassButton>
              <GlassButton
                variant="primary"
                onClick={submitUpdateRequest}
                className="disabled:opacity-50"
                disabled={loading}
              >
                Confirm and Submit
              </GlassButton>
            </div>
          </div>
        ) : (
          /* Main Update Request Form */
          <div className="relative flex-1 flex flex-col overflow-hidden">
            {/* Content */}
            <div className="p-4 flex-1 overflow-auto">
              <div className="mb-6">
                {uploadServices.length > 0 && <label className="mb-4 block"><span className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">Upload service</span><select className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)]" value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)}>{uploadServices.map((service) => <option key={service._id} value={service._id}>{service.productId?.serviceName || service.orderItems?.[0]?.name} · {Math.max(0, Number(service.servicePlanSnapshot?.portalAccessCount || 0) - Number(service.serviceAccessUsedInCycle || 0))} attempts left</option>)}</select></label>}
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">Upload Files</h4>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                Only JPG images, PDF, DOC, TXT and RTF documents are supported. Max file size: 5MB. Maximum {maxFileCount} files allowed. Images will be automatically compressed.
                </p>

                {/* File upload button */}
                <div className="flex items-center justify-center w-full">
                  <label
                    htmlFor="file-upload"
                    className={`border-2 border-dashed rounded-2xl w-full p-6 flex flex-col items-center justify-center cursor-pointer transition ${
                      files.length >= maxFileCount
                        ? 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] cursor-not-allowed'
                        : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg)]'
                    }`}
                  >
                    {/* `text-emerald-400` is a dark-theme shade — on the light panel the
                        drop-zone icon washed out. The success badge foreground is the
                        per-theme version of the same "ready / go ahead" colour. */}
                    <Upload className={`w-10 h-10 mb-2 ${files.length >= maxFileCount ? 'text-[var(--text-muted)]' : 'text-[var(--accent-soft-fg)]'}`} />
                    <p className={`text-sm ${files.length >= maxFileCount ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                      {files.length >= maxFileCount ? `Maximum files reached (${maxFileCount}/${maxFileCount})` : `Click to upload or drag and drop (${files.length}/${maxFileCount})`}
                    </p>
                    <input
                      id="file-upload"
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.txt,.rtf,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={files.length >= maxFileCount}
                    />
                  </label>
                </div>
                
                {/* File previews */}
                {files.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">Uploaded Files</h5>
                    <div className="divide-y divide-[var(--divider)] border-t border-[var(--glass-border)]">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center py-3">
                        {file.type.startsWith('image/') ? (
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden mr-3 border border-[var(--glass-border)]">
                            <img
                              src={file.preview}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : getFileIcon(file.type)}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-[var(--text-primary)]">{file.name}</p>
                          <p className="text-xs text-[var(--text-muted)] tabular-nums">
                            {(file.size / 1024).toFixed(1)} KB • {file.type.split('/')[1]}
                          </p>
                        </div>

                        <button
                          onClick={() => removeFile(index)}
                          className="ml-2 text-[var(--text-muted)] transition hover:text-[var(--danger-fg)]"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">Instructions</h4>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Please provide clear instructions for your website update.
                </p>

                {/* Previous messages */}
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3 mb-4 max-h-48 overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm text-center py-4">
                      No instructions added yet. Use the form below to add instructions.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--divider)]">
                      {messages.map((msg, index) => (
                        <div key={index} className="py-3 first:pt-0 last:pb-0">
                          <p className="text-sm text-[var(--text-primary)]">{msg.text}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Message input */}
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={messageInputRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter sends the message; Shift+Enter inserts a new line.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type your instructions here... (Enter to add, Shift+Enter for new line)"
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3 min-h-[80px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-soft-fg)] resize-none"
                    ></textarea>
                    <div className="absolute bottom-2 right-2 text-xs text-[var(--text-muted)] tabular-nums">
                      {message.length} characters
                    </div>
                  </div>
                  {/* Was `bg-emerald-600` with `--text-primary` on top: a fixed green fill
                      under a label that follows the theme, so in light mode it became dark
                      slate on green. GlassButton's primary inverts as a pair — ink fill,
                      page-ground label — in every theme. */}
                  <GlassButton
                    variant="primary"
                    onClick={sendMessage}
                    disabled={!message.trim()}
                    className="px-3 py-3 disabled:cursor-not-allowed disabled:bg-[var(--glass-bg)] disabled:text-[var(--text-muted)]"
                  >
                    <Send className="w-5 h-5" />
                  </GlassButton>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-[var(--glass-border)]">
              <GlassButton
                variant="primary"
                size="lg"
                onClick={() => {
                  // Agar message field mein kuch hai to pehle usse send kar do
                if (message.trim()) {
                  setMessages(prev => [...prev, { 
                    text: message.trim(),
                    timestamp: new Date()
                  }]);
                  setMessage(''); // Clear the message field
                }
                // Phir confirmation screen pe jao
                 setShowConfirmation(true);
                }}
                disabled={files.length === 0 && messages.length === 0}
                className="w-full py-3 disabled:cursor-not-allowed disabled:bg-[var(--glass-bg)] disabled:text-[var(--text-muted)]"
              >
                Proceed to Confirmation
              </GlassButton>

              {files.length === 0 && messages.length === 0 && (
                // `text-amber-300` is a dark-theme shade; on the light panel it measured
                // 1.46:1. The pending badge foreground is the per-theme version of the
                // same "needs your attention" colour.
                <p className="text-[var(--badge-pending-fg)] text-xs mt-2 text-center">
                  Please upload files or add instructions to proceed
                </p>
              )}
            </div>
          </div>
        )}
    </Modal>
  );
};

export default UpdateRequestModal;
