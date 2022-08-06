import { Document, Schema, model, Types } from 'mongoose'

export interface CosplayEpisodeDocument extends Document {
  _id: Types.ObjectId
  identify: Types.ObjectId
  title: string
  order: number
  updatedAt: Date
  pages: string[]
}

export interface CosplayDocument extends Document {
  _id: Types.ObjectId
  identify: Types.ObjectId
  author: string
  title: string
  description: string
  thumb: string
  tags: string[]
  totalPages: number
  totalEpisodes: number
  episodes: Types.DocumentArray<CosplayEpisodeDocument>
  type: 'cosplay' | 'star'
}

const CosplayEpisodeSchema = new Schema<CosplayEpisodeDocument>({
  identify: {
    type: Schema.Types.ObjectId,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  updatedAt: {
    type: Date,
    required: true
  },
  pages: {
    type: [String],
    required: true
  }
})

const CosplaySchema = new Schema<CosplayDocument>({
  identify: {
    type: Schema.Types.ObjectId,
    required: true,
    unique: true,
    index: true
  },
  author: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  thumb: {
    type: String,
    required: true
  },
  tags: {
    type: [String],
    required: true
  },
  totalPages: {
    type: Number,
    required: true
  },
  totalEpisodes: {
    type: Number,
    required: true
  },
  episodes: {
    type: [CosplayEpisodeSchema],
    required: true
  },
  type: {
    type: String,
    enum: ['cosplay', 'star'],
    required: true
  }
})

export default model<CosplayDocument>('ovo_picacomics', CosplaySchema)
