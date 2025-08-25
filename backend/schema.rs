// @generated automatically by Diesel CLI.

diesel::table! {
    todo (id) {
        id -> Integer,
        text -> Text,
        created_at -> Timestamp,
    }
}
