import { Document, Schema, model, Types } from 'mongoose'

export interface CosplayEpisodeDocument extends Document {
  _id: Types.ObjectId
  identify: Types.ObjectId
  title: string
  order: number
  updatedAt: number
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
  erotic: boolean
  totalPages: number
  totalEpisodes: number
  episodes: Types.DocumentArray<CosplayEpisodeDocument>
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
    type: Number,
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
  erotic: {
    type: Boolean,
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
  }
})

export default model<CosplayDocument>('cosplays', CosplaySchema)
