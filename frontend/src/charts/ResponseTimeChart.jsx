import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

const ResponseTimeChart = ({ data }) => {
    if (!data || data.length === 0) {
        return (
            <div className="bg-[#12121a] rounded-2xl p-6 border border-gray-800 h-[300px] flex items-center justify-center">
                <p className="text-gray-500">No response time data available</p>
            </div>
        );
    }

    const chartData = data.map(point => ({
        time: new Date(point.timestamp),
        value: typeof point.responseTime === 'number' ? point.responseTime : 0
    }));

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#1a1b26] p-3 border border-gray-700 rounded-lg shadow-xl">
                    <p className="text-gray-400 text-xs mb-1">{format(new Date(label), 'MMM d, HH:mm')}</p>
                    <p className="text-emerald-400 font-bold text-sm">
                        {payload[0].value} ms
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-[#12121a] rounded-2xl p-6 border border-gray-800">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Response Time</h3>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} vertical={false} />
                        <XAxis
                            dataKey="time"
                            stroke="#9ca3af"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(time) => format(time, 'HH:mm')}
                            minTickGap={50}
                        />
                        <YAxis
                            stroke="#9ca3af"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            unit=" ms"
                            width={50}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#10b981"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorResponse)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ResponseTimeChart;
