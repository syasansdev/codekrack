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

// Flatten an institution's students into one spreadsheet row each.
//
// The column order is defined ONCE here (object key order becomes column order
// in json_to_sheet), and every row carries every key — missing values become ''
// or 0 rather than a missing column, so the sheet stays rectangular even when
// some students haven't been scraped or have no LinkedIn.
//
// The per-platform metric field names mirror what serializeStudent produces and
// what the leaderboard reads, so the exported numbers match the ones on screen:
//   leetcode.totalSolved · codeforces.problemsSolved · atcoder.problemsSolved ·
//   github.repositories
export const buildInstitutionStudentRows = (students) => {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (students || []).map((s) => {
    const pd = s.platformData || {};
    const pu = s.platformUrls || {};
    return {
      Name: s.name || '',
      Email: s.email || '',
      'Roll Number': s.rollNumber || '',
      'Register Number': s.registerNumber || '',
      Department: s.department || '',
      Year: s.year || '',
      College: s.college || '',
      Phone: s.phoneNumber || '',
      '10th %': s.tenthPercentage ?? '',
      '12th %': s.twelfthPercentage ?? '',
      'Total Solved': n(s.totalSolved),
      'LeetCode Solved': n(pd.leetcode?.totalSolved),
      'LeetCode URL': pu.leetcode || '',
      'Codeforces Solved': n(pd.codeforces?.problemsSolved),
      'Codeforces Rating': n(pd.codeforces?.rating),
      'Codeforces URL': pu.codeforces || '',
      'AtCoder Solved': n(pd.atcoder?.problemsSolved),
      'AtCoder Rating': n(pd.atcoder?.rating),
      'AtCoder URL': pu.atcoder || '',
      'GitHub Repos': n(pd.github?.repositories),
      'GitHub URL': pu.github || '',
      LinkedIn: pu.linkedin || '',
      HackerRank: pu.hackerrank || '',
      Resume: pu.resume || '',
      'Last Scraped': s.scrapingStatus?.lastUpdated
        ? new Date(s.scrapingStatus.lastUpdated).toLocaleString()
        : '',
    };
  });
};

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
