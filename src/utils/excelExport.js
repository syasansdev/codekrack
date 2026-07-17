import * as XLSX from 'xlsx'

export const exportToExcel = (data, filename = 'export') => {
  if (!data || data.length === 0) {
    alert('No data to export')
    return
  }

  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new()
    
    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data)
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
    
    // Generate Excel file and trigger download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    
    // Create blob and download
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Clean up
    window.URL.revokeObjectURL(url)
    
    console.log('Excel file exported successfully')
  } catch (error) {
    console.error('Error exporting to Excel:', error)
    alert('Failed to export Excel file. Please try again.')
  }
}

// Helper function to format data for better Excel export
export const formatDataForExcel = (data) => {
  if (!data || data.length === 0) return []
  
  return data.map(item => {
    const formattedItem = {}
    
    Object.keys(item).forEach(key => {
      const value = item[key]
      
      // Handle nested objects
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          formattedItem[key] = value.join(', ')
        } else {
          // Flatten nested objects
          Object.keys(value).forEach(nestedKey => {
            formattedItem[`${key}_${nestedKey}`] = value[nestedKey]
          })
        }
      } else {
        formattedItem[key] = value
      }
    })
    
    return formattedItem
  })
}
