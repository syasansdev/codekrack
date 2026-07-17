import React, { useState } from 'react';

const StreakCalendar = () => {
  const [currentDate] = useState(new Date());
  // Mock data for completed days. In a real app, you would fetch this.
  const completedDays = [3, 5, 6, 11, 12, 13, 14, 20, 22];

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const getDayClass = (day) => {
    const today = new Date();
    const isToday = day === today.getDate() &&
                    currentDate.getMonth() === today.getMonth() &&
                    currentDate.getFullYear() === today.getFullYear();

    const isCompleted = completedDays.includes(day);

    let classes = 'w-7 h-7 flex items-center justify-center rounded-full text-xs ';
    if (isCompleted) {
      classes += 'bg-green-500 text-white';
    } else if (isToday) {
      classes += 'border-2 border-blue-500 text-blue-600 font-bold';
    } else {
      classes += 'text-gray-700 bg-gray-100';
    }
    return classes;
  };

  return (
    <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200 w-64">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-blue-800">
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {daysOfWeek.map(day => (
          <div key={day} className="text-xs font-medium text-gray-500">{day}</div>
        ))}
        {/* Blank spaces for days before the 1st of the month */}
        {Array.from({ length: firstDayOfMonth }).map((_, index) => (
          <div key={`empty-${index}`}></div>
        ))}
        {/* Calendar days */}
        {Array.from({ length: daysInMonth }).map((_, day) => (
          <div key={day + 1} className={getDayClass(day + 1)}>
            {day + 1}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StreakCalendar;