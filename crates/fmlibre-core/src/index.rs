use std::collections::HashMap;

use crate::text::fold;

/// Something the app lists: found by name or id, best first.
pub trait Listed {
    fn uid(&self) -> u32;
    /// Every name the item can be found by, separated by spaces.
    fn names(&self) -> String;
    fn display_name(&self) -> &str;
    /// Higher ranks come first in search results.
    fn rank(&self) -> i32;
}

/// Items with an accent- and case-insensitive name index.
pub struct SearchIndex<T> {
    items: Vec<T>,
    folded: Vec<String>,
    by_uid: HashMap<u32, usize>,
}

impl<T: Listed> SearchIndex<T> {
    pub fn new(items: Vec<T>) -> Self {
        let folded = items.iter().map(|item| fold(&item.names())).collect();
        let by_uid = items.iter().enumerate().map(|(i, item)| (item.uid(), i)).collect();
        Self { items, folded, by_uid }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn get(&self, uid: u32) -> Option<&T> {
        self.by_uid.get(&uid).map(|&i| &self.items[i])
    }

    /// Items whose names contain every word of `query` (ignoring accents and case), or
    /// whose id equals it; highest rank first. An empty query matches everything.
    pub fn search(&self, query: &str) -> Vec<&T> {
        let uid: Option<u32> = query.trim().parse().ok();
        let words: Vec<String> = fold(query).split_whitespace().map(str::to_owned).collect();
        let mut hits: Vec<&T> = self
            .items
            .iter()
            .zip(&self.folded)
            .filter(|(item, names)| uid == Some(item.uid()) || words.iter().all(|w| names.contains(w.as_str())))
            .map(|(item, _)| item)
            .collect();
        hits.sort_by(|a, b| b.rank().cmp(&a.rank()).then_with(|| a.display_name().cmp(b.display_name())));
        hits
    }
}
