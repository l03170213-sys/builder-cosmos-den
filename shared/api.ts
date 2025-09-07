/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

export interface DemoResponse {
  message: string;
}

export interface CategoryAverage {
  name: string;
  average: number; // value out of 5
}

export interface ResortAveragesResponse {
  resort: string; // e.g., "VM Resort Albanie"
  updatedAt: string; // ISO timestamp
  overallAverage: number; // last column "moyenne generale"
  categories: CategoryAverage[]; // derived from header columns (excluding first and last)
}

export interface ResortSummaryResponse {
  resort: string;
  respondents: number; // number of non-empty rows in sheet1
  recommendationRate: number | null; // 0..1 or null if not available
}
