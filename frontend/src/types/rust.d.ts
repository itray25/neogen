/* This file is generated and managed by tsync */

/** Struct representing a row in table `todo` */
interface Todo {
  /** Field representing column `id` */
  id: number;
  /** Field representing column `text` */
  text: string;
  /** Field representing column `created_at` */
  created_at: Date;
}

/** Create Struct for a row in table `todo` for [`Todo`] */
interface CreateTodo {
  /** Field representing column `text` */
  text: string;
}

/** Update Struct for a row in table `todo` for [`Todo`] */
interface UpdateTodo {
  /** Field representing column `text` */
  text?: string;
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

interface PaginationParams {
  page: number;
  page_size: number;
}
