import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PredictionResult {
  label: string;
  confidence: number;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  private apiUrl = 'http://127.0.0.1:8000/drone/predict';

  constructor(private http: HttpClient) { }

  predict(file: File): Observable<PredictionResult> {
    const formData = new FormData();
    formData.append('audio', file);
    return this.http.post<PredictionResult>(this.apiUrl, formData);
  }
}
