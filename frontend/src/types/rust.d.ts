/* This file is generated and managed by tsync */

/** Struct representing a row in table `rooms` */
interface Rooms {
  /** Field representing column `id` */
  id?: number;
  /** Field representing column `name` */
  name: string;
  /** Field representing column `password` */
  password?: string;
  /** Field representing column `is_public` */
  is_public: boolean;
  /** Field representing column `created_at` */
  created_at: Date;
}

/** Create Struct for a row in table `rooms` for [`Rooms`] */
interface CreateRooms {
  /** Field representing column `name` */
  name: string;
  /** Field representing column `password` */
  password?: string;
  /** Field representing column `is_public` */
  is_public: boolean;
}

/** Update Struct for a row in table `rooms` for [`Rooms`] */
interface UpdateRooms {
  /** Field representing column `name` */
  name?: string;
  /** Field representing column `password` */
  password?: string;
  /** Field representing column `is_public` */
  is_public?: boolean;
  /** Field representing column `created_at` */
  created_at?: Date;
}

/** Result of a `.paginate` function */
interface PaginationResult<T> {
  /** Resulting items that are from the current page */
  items: Array<T>;
  /** The count of total items there are */
  total_items: number;
  /** Current page, 0-based index */
  page: number;
  /** Size of a page */
  page_size: number;
  /** Number of total possible pages, given the `page_size` and `total_items` */
  num_pages: number;
}
