/* @generated and managed by dsync */

#[allow(unused)]
use crate::diesel::*;
use crate::schema::*;

pub type ConnectionType = create_rust_app::Connection;

/// Struct representing a row in table `todo`
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::Queryable, diesel::Selectable, diesel::QueryableByName, diesel::Identifiable)]
#[diesel(table_name=todo, primary_key(id))]
pub struct Todo {
    /// Field representing column `id`
    pub id: i32,
    /// Field representing column `text`
    pub text: String,
    /// Field representing column `created_at`
    pub created_at: chrono::NaiveDateTime,
}

/// Create Struct for a row in table `todo` for [`Todo`]
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::Insertable)]
#[diesel(table_name=todo)]
pub struct CreateTodo {
    /// Field representing column `text`
    pub text: String,
}

/// Update Struct for a row in table `todo` for [`Todo`]
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::AsChangeset, PartialEq, Default)]
#[diesel(table_name=todo)]
pub struct UpdateTodo {
    /// Field representing column `text`
    pub text: Option<String>,
    /// Field representing column `created_at`
    pub created_at: Option<chrono::NaiveDateTime>,
}

/// Result of a `.paginate` function
#[tsync::tsync]
#[derive(Debug, serde::Serialize)]
pub struct PaginationResult<T> {
    /// Resulting items that are from the current page
    pub items: Vec<T>,
    /// The count of total items there are
    pub total_items: i64,
    /// Current page, 0-based index
    pub page: i64,
    /// Size of a page
    pub page_size: i64,
    /// Number of total possible pages, given the `page_size` and `total_items`
    pub num_pages: i64,
}

impl Todo {
    /// Insert a new row into `todo` with a given [`CreateTodo`]
    pub fn create(db: &mut ConnectionType, item: &CreateTodo) -> diesel::QueryResult<Self> {
        use crate::schema::todo::dsl::*;

        diesel::insert_into(todo).values(item).get_result::<Self>(db)
    }

    /// Get a row from `todo`, identified by the primary key
    pub fn read(db: &mut ConnectionType, param_id: i32) -> diesel::QueryResult<Self> {
        use crate::schema::todo::dsl::*;

        todo.filter(id.eq(param_id)).first::<Self>(db)
    }

    /// Paginates through the table where page is a 0-based index (i.e. page 0 is the first page)
    pub fn paginate(db: &mut ConnectionType, page: i64, page_size: i64, filter: TodoFilter) -> diesel::QueryResult<PaginationResult<Self>> {
        let page = page.max(0);
        let page_size = page_size.max(1);
        let total_items = Self::filter(filter.clone()).count().get_result(db)?;
        let items = Self::filter(filter).limit(page_size).offset(page * page_size).load::<Self>(db)?;

        Ok(PaginationResult {
            items,
            total_items,
            page,
            page_size,
            /* ceiling division of integers */
            num_pages: total_items / page_size + i64::from(total_items % page_size != 0)
        })
    }

    /// A utility function to help build custom search queries
    /// 
    /// Example:
    /// 
    /// ```
    /// // create a filter for completed todos
    /// let query = Todo::filter(TodoFilter {
    ///     completed: Some(true),
    ///     ..Default::default()
    /// });
    /// 
    /// // delete completed todos
    /// diesel::delete(query).execute(db)?;
    /// ```
    pub fn filter<'a>(
        filter: TodoFilter,
    ) -> crate::schema::todo::BoxedQuery<'a, diesel::sqlite::Sqlite> {
        let mut query = crate::schema::todo::table.into_boxed();
        
        if let Some(filter_id) = filter.id {
            query = query.filter(crate::schema::todo::id.eq(filter_id));
        }
        if let Some(filter_text) = filter.text {
            query = query.filter(crate::schema::todo::text.eq(filter_text));
        }
        if let Some(filter_created_at) = filter.created_at {
            query = query.filter(crate::schema::todo::created_at.eq(filter_created_at));
        }
        
        query
    }

    /// Update a row in `todo`, identified by the primary key with [`UpdateTodo`]
    pub fn update(db: &mut ConnectionType, param_id: i32, item: &UpdateTodo) -> diesel::QueryResult<Self> {
        use crate::schema::todo::dsl::*;

        diesel::update(todo.filter(id.eq(param_id))).set(item).get_result(db)
    }

    /// Delete a row in `todo`, identified by the primary key
    pub fn delete(db: &mut ConnectionType, param_id: i32) -> diesel::QueryResult<usize> {
        use crate::schema::todo::dsl::*;

        diesel::delete(todo.filter(id.eq(param_id))).execute(db)
    }
}
#[derive(Debug, Default, Clone)]
pub struct TodoFilter {
    pub id: Option<i32>,
    pub text: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
}
