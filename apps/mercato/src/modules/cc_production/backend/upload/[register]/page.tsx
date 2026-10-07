"use client"

import * as React from 'react'
import { UploadRegisterPage } from '../../../components/UploadCentre'

export default function UploadOneRegisterPage({ params }: { params?: { register?: string } }) {
  return <UploadRegisterPage registerKey={String(params?.register ?? '')} />
}
