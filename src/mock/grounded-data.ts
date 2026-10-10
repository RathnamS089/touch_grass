import type { DailyMetric, GroundedSettings, Intervention, OutdoorPlace, UsagePoint } from "@/types/grounded";

export const outdoorPlaces: OutdoorPlace[] = [
  {
    id: "cubbon-park",
    name: "Cubbon Park",
    category: "Park",
    distance: "1.8 km",
    description: "A quiet place for a short walk.",
    imageUrl: "/images/cubbon-park.jpg",
    lat: 12.9763,
    lon: 77.5929,
  },
  {
    id: "lalbagh",
    name: "Lalbagh Botanical Garden",
    category: "Botanical garden",
    distance: "3.2 km",
    description: "A slower route with shade, stone paths, and room to breathe.",
    imageUrl: "/images/lalbagh.jpg",
    lat: 12.9507,
    lon: 77.5848,
  },
  {
    id: "ulsoor-lake",
    name: "Ulsoor Lake",
    category: "Lake walk",
    distance: "2.7 km",
    description: "A waterside loop for when your eyes need a wider horizon.",
    imageUrl: "/images/ulsoor-lake.jpg",
    lat: 12.9812,
    lon: 77.6216,
  },
  {
    id: "neighborhood-park",
    name: "Neighborhood Park",
    category: "Park",
    distance: "0.5 km",
    description: "A small local park perfect for a quick break.",
    imageUrl: "/images/neighborhood-park.jpg",
    lat: 12.9716,
    lon: 77.5946,
  },
  {
    id: "scenic-trail",
    name: "Scenic Walking Trail",
    category: "Trail",
    distance: "2.1 km",
    description: "A peaceful trail with beautiful views and fresh air.",
    imageUrl: "/images/scenic-trail.jpg",
    lat: 12.9137,
    lon: 77.6101,
  },
];

export const mockIntervention: Intervention = {
  message: "You've been here for a while. Maybe step outside?",
  breakMinutes: 15,
  place: outdoorPlaces[0],
};

export const overviewMetrics: DailyMetric[] = [
  { label: "Total screen time", value: "4h 31m", description: "Today" },
  { label: "Longest session", value: "1h 47m", description: "Gentle reminder at 60m" },
  { label: "Sessions", value: "5", description: "Started today" },
  { label: "Breaks encouraged", value: "2", description: "A little reset goes a long way" },
];

export const usagePoints: UsagePoint[] = [
  { time: "09:00", value: 3 },
  { time: "11:00", value: 7 },
  { time: "13:00", value: 2 },
  { time: "15:00", value: 5 },
  { time: "17:00", value: 8 },
];

export const defaultSettings: GroundedSettings = {
  sessionThresholdMinutes: 60,
  breakDurationMinutes: 15,
  reminderFrequencyMinutes: 60,
  natureImagery: true,
  nearbyRecommendations: true,
};

// Mock messages for different states
export const groundedMessages = {
  resting: {
    label: "GROUNDED",
    message: "The world is still out there.",
    secondary: "Whenever you're ready.",
  },
  active: {
    label: "PRESENT",
    message: "You're doing fine.",
    secondary: undefined,
  },
  "threshold-exceeded": {
    label: "A LITTLE OUTSIDE",
    message: "You've been here for a while.",
    secondary: "Maybe step outside?",
  },
  recommendation: {
    label: "A LITTLE OUTSIDE",
    message: "Cubbon Park",
    secondary: "1.8 km · Park",
  },
};