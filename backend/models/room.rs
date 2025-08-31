use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Queryable, Insertable, AsChangeset, Identifiable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::rooms)]
pub struct Room {
    pub id: Option<i32>,
    pub name: String,
    pub password: Option<String>,
    pub is_public: bool,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::rooms)]
pub struct NewRoom {
    pub name: String,
    pub password: Option<String>,
    pub is_public: bool,
}
