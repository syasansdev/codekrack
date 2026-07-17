import { useState, useRef, useEffect } from 'react'
import { exportToExcel, formatDataForExcel } from '../utils/excelExport'
import { queryAPI } from '../services/apii'
import BackButton from './BackButton'

// Data Table Component
const DataTable = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-gray-500 text-sm">No data available</p>
  }

  const columns = Object.keys(data[0])

  return (
    <div className="overflow-x-auto mt-4 animate-fadeIn">
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((column) => (
              <th 
                key={column}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, index) => (
            <tr 
              key={index} 
              className="hover:bg-gray-50 transition-colors duration-150"
            >
              {columns.map((column) => (
                <td key={column} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                  {typeof row[column] === 'object' 
                    ? JSON.stringify(row[column]) 
                    : String(row[column] || '-')
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Scroll to Top Component
const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 z-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </>
  )
}

const QueryBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: 'Hello! I\'m your CodeKrack assistant. Ask me anything about students, their coding progress, or any data queries you have.',
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const pageTopRef = useRef(null)

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await queryAPI(inputValue)
      
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: response,
        timestamp: new Date(),
        data: response.data || null
      }

      setMessages(prev => [...prev, botMessage])
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: {
          success: false,
          message: 'Sorry, I encountered an error processing your request. Please try again.',
          error: error.message
        },
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleDownloadExcel = (data) => {
    if (data && data.length > 0) {
      const formattedData = formatDataForExcel(data)
      exportToExcel(formattedData, 'query-results')
    }
  }

  const handleExampleQueryClick = (query) => {
    setInputValue(query)
    // Focus on textarea after setting value
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  const clearChat = () => {
    setMessages([
      {
        id: 1,
        type: 'bot',
        content: 'Hello! I\'m your CodeKrack assistant. Ask me anything about students, their coding progress, or any data queries you have.',
        timestamp: new Date()
      }
    ])
    // Scroll to top after clearing chat
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // Enhanced message content renderer
  const renderMessageContent = (message) => {
    if (typeof message.content === 'string') {
      return <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
    } else {
      return (
        <div>
          <p className="text-sm leading-relaxed mb-2">{message.content.message}</p>
          {message.content.success && message.data && (
            <div className="mt-3">
              {/* <div className="mb-2 p-2 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700 font-medium">
                  Found {message.data.length} result{message.data.length !== 1 ? 's' : ''} for your query.
                </p>
              </div> */}
              <DataTable data={message.data} />
              <button
                onClick={() => handleDownloadExcel(message.data)}
                className="mt-3 inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors duration-150 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Excel
              </button>
            </div>
          )}
        </div>
      )
    }
  }

  const exampleQueries = [
    "Show AI department students",
    "Who solved more than 300 leetcode problems?",
    "Get students with codeforces rating above 800",
    "Show all students from Technology college",
    "Find students by roll number 23IT1207",
    "Get phone number of student with registerNumber 312423205031"
  ]

  return (
    <>
      <BackButton to="/admin/dashboard" />
      <div className="min-h-screen bg-gray-50">
      {/* Page Top Reference */}
      <div ref={pageTopRef} className="absolute top-0" />
      
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8" style={{ width: '90vw' }}>
        
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CodeKrack Assistant</h1>
              <p className="mt-1 text-sm text-gray-600">Ask questions about student data and analytics</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-4 text-sm text-gray-500">
                <span className="px-3 py-1 bg-white rounded-md border border-gray-200">AI Powered</span>
                <span className="px-3 py-1 bg-white rounded-md border border-gray-200">Real-time</span>
              </div>
              <button
                onClick={clearChat}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
              >
                Clear Chat
              </button>
              <button
                onClick={scrollToTop}
                className="hidden md:flex items-center px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Top
              </button>
            </div>
          </div>
        </header>

        {/* Main Chat Area */}
        <main className="mb-8">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            
            {/* Messages Container */}
            <div className="h-[600px] overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-slideIn`}
                >
                  <div className={`max-w-3xl ${message.type === 'user' ? 'ml-12' : 'mr-12'}`}>
                    
                    {/* Message Header */}
                    <div className={`flex items-center mb-1 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-xs font-medium text-gray-500">
                        {message.type === 'user' ? 'You' : 'Assistant'}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Message Content */}
                    <div className={`rounded-lg px-4 py-3 ${
                      message.type === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      {renderMessageContent(message)}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex justify-start animate-fadeIn">
                  <div className="max-w-3xl mr-12">
                    <div className="flex items-center mb-1">
                      <span className="text-xs font-medium text-gray-500">Assistant</span>
                    </div>
                    <div className="bg-gray-100 rounded-lg px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-sm text-gray-600">Processing your query...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your question here... (Press Enter to send, Shift+Enter for new line)"
                    rows="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    disabled={isLoading}
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center min-w-[80px]"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">Press Enter to send, Shift + Enter for new line</p>
            </div>

          </div>
        </main>

        {/* Example Queries - Bottom Section */}
        <section>
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Example Queries</h3>
              <span className="text-xs text-gray-500">{messages.length - 1} messages</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {exampleQueries.map((query, index) => (
                <button
                  key={index}
                  onClick={() => handleExampleQueryClick(query)}
                  disabled={isLoading}
                  className="text-left text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        </section>

      </div>

      {/* Scroll to Top Button */}
      <ScrollToTopButton />

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
      </div>
    </>
  )
}

export default QueryBot