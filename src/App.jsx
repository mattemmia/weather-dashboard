import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { WiDaySunny, WiCloudy, WiRain, WiSnow, WiThunderstorm, WiFog, WiSunrise, WiSunset } from 'react-icons/wi'
import { FiSearch, FiMapPin, FiRefreshCw, FiWind, FiAlertTriangle, FiStar, FiTrash2 } from 'react-icons/fi'

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY
const BASE_URL = 'https://api.openweathermap.org/data/2.5'

function App() {
  // State management
  const [city, setCity] = useState(localStorage.getItem('lastCity') || 'Lagos')
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState([])
  const [dailyForecast, setDailyForecast] = useState([])
  const [airQuality, setAirQuality] = useState(null)
  const [alerts, setAlerts] = useState([]) // NEW: Weather alerts
  const [favorites, setFavorites] = useState(JSON.parse(localStorage.getItem('favCities') || '[]')) // NEW: Favorites
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [units, setUnits] = useState('metric')

  // Weather icon mapping
  const getIcon = (main, size = 80) => {
    const props = { size, className: "text-indigo-400" }
    switch (main) {
      case 'Clear': return <WiDaySunny {...props} />
      case 'Clouds': return <WiCloudy {...props} />
      case 'Rain': return <WiRain {...props} />
      case 'Drizzle': return <WiRain {...props} />
      case 'Snow': return <WiSnow {...props} />
      case 'Thunderstorm': return <WiThunderstorm {...props} />
      case 'Mist':
      case 'Fog':
      case 'Haze': return <WiFog {...props} />
      default: return <WiCloudy {...props} />
    }
  }

  // Format Unix timestamp to local time string
  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get AQI label and color based on OpenWeather AQI scale 1-5
  const getAqiInfo = (aqi) => {
    switch (aqi) {
      case 1: return { label: 'Good', color: 'text-green-400', bg: 'bg-green-900/30' }
      case 2: return { label: 'Fair', color: 'text-yellow-400', bg: 'bg-yellow-900/30' }
      case 3: return { label: 'Moderate', color: 'text-orange-400', bg: 'bg-orange-900/30' }
      case 4: return { label: 'Poor', color: 'text-red-400', bg: 'bg-red-900/30' }
      case 5: return { label: 'Very Poor', color: 'text-purple-400', bg: 'bg-purple-900/30' }
      default: return { label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-700/50' }
    }
  }

  // NEW: Add/remove city from favorites
  const toggleFavorite = (cityName) => {
    let updated
    if (favorites.includes(cityName)) {
      updated = favorites.filter(c => c !== cityName)
    } else {
      updated = [...favorites, cityName]
    }
    setFavorites(updated)
    localStorage.setItem('favCities', JSON.stringify(updated))
  }

  // Group 3-hour forecasts into daily forecasts
  const processDailyForecast = (list) => {
    const daily = {}
    list.forEach(item => {
      const date = new Date(item.dt * 1000).toLocaleDateString()
      if (!daily[date]) {
        daily[date] = {
          temps: [],
          icons: [],
          dt: item.dt
        }
      }
      daily[date].temps.push(item.main.temp)
      daily[date].icons.push(item.weather[0].main)
    })

    return Object.keys(daily).slice(0, 5).map(date => {
      const day = daily[date]
      const mostCommonIcon = day.icons.sort((a, b) =>
        day.icons.filter(v => v === a).length - day.icons.filter(v => v === b).length
      ).pop()

      return {
        date,
        min: Math.round(Math.min(...day.temps)),
        max: Math.round(Math.max(...day.temps)),
        icon: mostCommonIcon,
        dt: day.dt
      }
    })
  }

  // Fetch weather data + air quality + alerts
  const fetchWeather = async (query) => {
    setLoading(true)
    setError('')
    setAirQuality(null)
    setAlerts([])
    try {
      const params = typeof query === 'string'
        ? `q=${query}`
        : `lat=${query.lat}&lon=${query.lon}`

      // Get current weather + 5 day forecast
      const [currentRes, forecastRes] = await Promise.all([
        axios.get(`${BASE_URL}/weather?${params}&appid=${API_KEY}&units=${units}`),
        axios.get(`${BASE_URL}/forecast?${params}&appid=${API_KEY}&units=${units}`)
      ])

      setWeather(currentRes.data)
      setForecast(forecastRes.data.list.slice(0, 8))
      setDailyForecast(processDailyForecast(forecastRes.data.list))

      // Get Air Quality Index using coords from current weather
      const { lat, lon } = currentRes.data.coord
      try {
        const aqiRes = await axios.get(
          `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
        )
        setAirQuality(aqiRes.data.list[0])
      } catch (aqiErr) {
        console.warn('AQI unavailable:', aqiErr)
      }

      // NEW: Get weather alerts if available - included in weather response for some locations
      if (currentRes.data.alerts) {
        setAlerts(currentRes.data.alerts)
      }

      // Save last successful city to localStorage
      if (typeof query === 'string') {
        localStorage.setItem('lastCity', query)
      } else {
        localStorage.setItem('lastCity', currentRes.data.name)
        setCity(currentRes.data.name)
      }

    } catch (err) {
      if (err.response?.status === 404) {
        setError('City not found. Check spelling and try again.')
      } else if (err.response?.status === 401) {
        setError('Invalid API key. Check your.env file.')
      } else {
        setError('Failed to fetch weather. Try again later.')
      }
      setWeather(null)
      setForecast([])
      setDailyForecast([])
      setAirQuality(null)
      setAlerts([])
    }
    setLoading(false)
  }

  // Get user's location via browser geolocation
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser')
      return
    }

    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      (err) => {
        setError('Location access denied. Search for a city instead.')
        setLoading(false)
      }
    )
  }

  // Toggle between Celsius and Fahrenheit
  const toggleUnits = () => {
    const newUnits = units === 'metric' ? 'imperial' : 'metric'
    setUnits(newUnits)
  }

  // Load initial weather on mount + refetch when units change
  useEffect(() => {
    fetchWeather(city)
  }, [units])

  // Handle search form submit
  const handleSearch = (e) => {
    e.preventDefault()
    if (city.trim()) fetchWeather(city.trim())
  }

  // Chart data for 24hr forecast
  const chartData = forecast.map(item => ({
    time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit' }),
    temp: Math.round(item.main.temp),
    icon: item.weather[0].main
  }))

  const tempUnit = units === 'metric' ? '°C' : '°F'
  const speedUnit = units === 'metric' ? 'm/s' : 'mph'
  const aqiInfo = airQuality ? getAqiInfo(airQuality.main.aqi) : null
  const isFavorite = weather ? favorites.includes(weather.name) : false

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-indigo-400">
            Weather Dashboard
          </h1>
          <button
            onClick={toggleUnits}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-semibold transition-colors border border-slate-700"
          >
            {units === 'metric' ? '°F' : '°C'}
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Enter city name"
              className="w-full pl-12 pr-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={getUserLocation}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            title="Use my location"
          >
            <FiMapPin size={20} />
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            {loading ? <FiRefreshCw className="animate-spin" /> : 'Search'}
          </button>
        </form>

        {/* NEW: Favorite Cities */}
        {favorites.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            {favorites.map((fav) => (
              <button
                key={fav}
                onClick={() => {
                  setCity(fav)
                  fetchWeather(fav)
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm border border-slate-700 flex items-center gap-2"
              >
                <FiStar className="text-yellow-400" size={14} />
                {fav}
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <FiRefreshCw className="animate-spin text-indigo-400" size={32} />
            <p className="ml-3 text-slate-400">Loading weather data...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center text-red-400 bg-red-900/30 py-4 px-6 rounded-lg mb-6 border border-red-800">
            {error}
          </div>
        )}

        {/* NEW: Weather Alerts */}
        {alerts.length > 0 && !loading && (
          <div className="mb-6">
            {alerts.map((alert, idx) => (
              <div key={idx} className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-3">
                <div className="flex items-start gap-3">
                  <FiAlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-semibold text-red-400">{alert.event}</h4>
                    <p className="text-sm text-slate-300 mt-1">{alert.description}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      From: {new Date(alert.start * 1000).toLocaleString()} -
                      To: {new Date(alert.end * 1000).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Current Weather Card */}
        {weather && !loading && (
          <div className="bg-slate-800 rounded-2xl p-6 md:p-8 mb-6 shadow-xl border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold">
                  {weather.name}, {weather.sys.country}
                </h2>
                {/* NEW: Favorite star button */}
                <button
                  onClick={() => toggleFavorite(weather.name)}
                  className={`p-2 rounded-lg transition-colors ${isFavorite ? 'text-yellow-400 bg-yellow-900/30' : 'text-slate-400 hover:text-yellow-400 hover:bg-slate-700'
                    }`}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <FiStar size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="text-slate-400 text-sm">
                {new Date(weather.dt * 1000).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div className="flex items-center justify-center gap-6 mb-6">
              {getIcon(weather.weather[0].main, 100)}
              <div className="text-center">
                <span className="text-7xl font-bold block">
                  {Math.round(weather.main.temp)}{tempUnit}
                </span>
                <p className="text-xl text-slate-300 capitalize mt-2">
                  {weather.weather[0].description}
                </p>
              </div>
            </div>

            {/* Weather Stats Grid - 7 items with AQI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm mb-1">Feels like</p>
                <p className="text-2xl font-semibold">{Math.round(weather.main.feels_like)}{tempUnit}</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm mb-1">Humidity</p>
                <p className="text-2xl font-semibold">{weather.main.humidity}%</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm mb-1">Wind</p>
                <p className="text-2xl font-semibold">{weather.wind.speed} {speedUnit}</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm mb-1">Pressure</p>
                <p className="text-2xl font-semibold">{weather.main.pressure} hPa</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 text-sm mb-1">
                  <WiSunrise size={20} />
                  <span>Sunrise</span>
                </div>
                <p className="text-2xl font-semibold">{formatTime(weather.sys.sunrise)}</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 text-sm mb-1">
                  <WiSunset size={20} />
                  <span>Sunset</span>
                </div>
                <p className="text-2xl font-semibold">{formatTime(weather.sys.sunset)}</p>
              </div>
              {/* Air Quality Index Card */}
              <div className={`rounded-lg p-4 text-center col-span-2 md:col-span-2 ${aqiInfo ? aqiInfo.bg : 'bg-slate-700/50'}`}>
                <div className="flex items-center justify-center gap-1 text-slate-400 text-sm mb-1">
                  <FiWind size={16} />
                  <span>Air Quality</span>
                </div>
                {airQuality ? (
                  <>
                    <p className={`text-2xl font-semibold ${aqiInfo.color}`}>
                      {airQuality.main.aqi}
                    </p>
                    <p className={`text-sm ${aqiInfo.color}`}>{aqiInfo.label}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      PM2.5: {airQuality.components.pm2_5.toFixed(1)} μg/m³
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">Unavailable</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 24 Hour Forecast Chart */}
        {forecast.length > 0 && !loading && (
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 mb-6">
            <h3 className="text-xl font-semibold mb-4">24 Hour Forecast</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value) => [`${value}${tempUnit}`, 'Temp']}
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="#818cf8"
                  strokeWidth={3}
                  dot={{ fill: '#818cf8', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 5 Day Forecast Cards */}
        {dailyForecast.length > 0 && !loading && (
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
            <h3 className="text-xl font-semibold mb-4">5-Day Forecast</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {dailyForecast.map((day, idx) => (
                <div key={idx} className="bg-slate-700/50 rounded-lg p-4 text-center hover:bg-slate-700 transition-colors">
                  <p className="text-slate-400 text-sm mb-2">
                    {idx === 0 ? 'Today' : new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <div className="flex justify-center mb-2">
                    {getIcon(day.icon, 48)}
                  </div>
                  <p className="font-semibold">
                    <span className="text-slate-100">{day.max}{tempUnit}</span>
                    <span className="text-slate-400 text-sm ml-2">{day.min}{tempUnit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App