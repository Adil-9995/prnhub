export const APP_NAME = import.meta.env.VITE_APP_NAME || 'FOSSHub'
export const CURRENT_YEAR = new Date().getFullYear()
const hour = new Date().getHours()
export const DASHBOARD_GREETING = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
