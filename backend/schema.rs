// @generated automatically by Diesel CLI.

diesel::table! {
    rooms (id) {
        id -> Nullable<Integer>,
        name -> Text,
        password -> Nullable<Text>,
        is_public -> Bool,
        created_at -> Timestamp,
    }
}

diesel::table! {
    users (id) {
        id -> Text,
        username -> Text,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    rooms,
    users,
);
