/* @generated and managed by dsync */

#[allow(unused)]
use crate::diesel::*;
use crate::schema::*;

pub type ConnectionType = create_rust_app::Connection;

/// Struct representing a row in table `rooms`
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::Queryable, diesel::Selectable, diesel::QueryableByName, diesel::Identifiable)]
#[diesel(table_name=rooms, primary_key(id))]
pub struct Rooms {
    /// Field representing column `id`
    pub id: Option<i32>,
    /// Field representing column `name`
    pub name: String,
    /// Field representing column `password`
    pub password: Option<String>,
    /// Field representing column `is_public`
    pub is_public: bool,
    /// Field representing column `created_at`
    pub created_at: chrono::NaiveDateTime,
}

/// Create Struct for a row in table `rooms` for [`Rooms`]
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::Insertable)]
#[diesel(table_name=rooms)]
pub struct CreateRooms {
    /// Field representing column `name`
    pub name: String,
    /// Field representing column `password`
    pub password: Option<String>,
    /// Field representing column `is_public`
    pub is_public: bool,
}

/// Update Struct for a row in table `rooms` for [`Rooms`]
#[tsync::tsync]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, diesel::AsChangeset, PartialEq, Default)]
#[diesel(table_name=rooms)]
pub struct UpdateRooms {
    /// Field representing column `name`
    pub name: Option<String>,
    /// Field representing column `password`
    pub password: Option<Option<String>>,
    /// Field representing column `is_public`
    pub is_public: Option<bool>,
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

impl Rooms {
    /// Insert a new row into `rooms` with a given [`CreateRooms`]
    pub fn create(db: &mut ConnectionType, item: &CreateRooms) -> diesel::QueryResult<Self> {
        use crate::schema::rooms::dsl::*;

        diesel::insert_into(rooms).values(item).get_result::<Self>(db)
    }

    /// Get a row from `rooms`, identified by the primary key
    pub fn read(db: &mut ConnectionType, param_id: i32) -> diesel::QueryResult<Self> {
        use crate::schema::rooms::dsl::*;

        rooms.filter(id.eq(param_id)).first::<Self>(db)
    }

    /// Paginates through the table where page is a 0-based index (i.e. page 0 is the first page)
    pub fn paginate(db: &mut ConnectionType, page: i64, page_size: i64, filter: RoomsFilter) -> diesel::QueryResult<PaginationResult<Self>> {
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
        filter: RoomsFilter,
    ) -> crate::schema::rooms::BoxedQuery<'a, diesel::sqlite::Sqlite> {
        let mut query = crate::schema::rooms::table.into_boxed();
        
        if let Some(filter_id) = filter.id {
            query = if filter_id.is_some() { 
                query.filter(crate::schema::rooms::id.eq(filter_id))
            } else {
                query.filter(crate::schema::rooms::id.is_null())
            };
        }
        if let Some(filter_name) = filter.name {
            query = query.filter(crate::schema::rooms::name.eq(filter_name));
        }
        if let Some(filter_password) = filter.password {
            query = if filter_password.is_some() { 
                query.filter(crate::schema::rooms::password.eq(filter_password))
            } else {
                query.filter(crate::schema::rooms::password.is_null())
            };
        }
        if let Some(filter_is_public) = filter.is_public {
            query = query.filter(crate::schema::rooms::is_public.eq(filter_is_public));
        }
        if let Some(filter_created_at) = filter.created_at {
            query = query.filter(crate::schema::rooms::created_at.eq(filter_created_at));
        }
        
        query
    }

    /// Update a row in `rooms`, identified by the primary key with [`UpdateRooms`]
    pub fn update(db: &mut ConnectionType, param_id: i32, item: &UpdateRooms) -> diesel::QueryResult<Self> {
        use crate::schema::rooms::dsl::*;

        diesel::update(rooms.filter(id.eq(param_id))).set(item).get_result(db)
    }

    /// Delete a row in `rooms`, identified by the primary key
    pub fn delete(db: &mut ConnectionType, param_id: i32) -> diesel::QueryResult<usize> {
        use crate::schema::rooms::dsl::*;

        diesel::delete(rooms.filter(id.eq(param_id))).execute(db)
    }
}
#[derive(Debug, Default, Clone)]
pub struct RoomsFilter {
    pub id: Option<Option<i32>>,
    pub name: Option<String>,
    pub password: Option<Option<String>>,
    pub is_public: Option<bool>,
    pub created_at: Option<chrono::NaiveDateTime>,
}
