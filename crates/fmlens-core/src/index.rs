use std::collections::HashMap;
use std::sync::OnceLock;

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
    /// Every name of each item, folded for matching.
    folded: Vec<String>,
    /// Each item's display name, folded for ordering, so "Özil" sorts with the O's.
    sort_names: Vec<String>,
    by_uid: HashMap<u32, usize>,
    /// The items best first (see `search`): worked out at the first search, and again after an item changed, so that
    /// a search does not sort every hit by rank and name each time.
    ranked: OnceLock<Ranked>,
}

/// The items of an index in the order a search answers in.
struct Ranked {
    /// The items' places in the index, best first.
    order: Vec<usize>,
    /// Where each item comes in `order`, by its place in the index.
    place: Vec<usize>,
}

impl<T: Listed> SearchIndex<T> {
    pub fn new(items: Vec<T>) -> Self {
        let folded = items.iter().map(|item| fold(&item.names())).collect();
        let sort_names = items.iter().map(|item| fold(item.display_name())).collect();
        let by_uid = items.iter().enumerate().map(|(i, item)| (item.uid(), i)).collect();
        Self { items, folded, sort_names, by_uid, ranked: OnceLock::new() }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Every item, in the order they were read.
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.items.iter()
    }

    pub fn get(&self, uid: u32) -> Option<&T> {
        self.by_uid.get(&uid).map(|&i| &self.items[i])
    }

    /// Changes the item with `uid` in place, e.g. after an edit; its names must stay the same.
    pub fn update(&mut self, uid: u32, change: impl FnOnce(&mut T)) -> bool {
        match self.by_uid.get(&uid) {
            Some(&i) => {
                change(&mut self.items[i]);
                // Its rank may be another now.
                self.ranked.take();
                true
            }
            None => false,
        }
    }

    /// Items whose names contain every word of `query` (ignoring accents and case), or
    /// whose id equals it; highest rank first, then by name. An empty query matches everything.
    pub fn search(&self, query: &str) -> Vec<&T> {
        let ranked = self.ranked();
        let uid: Option<u32> = query.trim().parse().ok();
        let words: Vec<String> = fold(query).split_whitespace().map(str::to_owned).collect();
        if words.is_empty() {
            return ranked.order.iter().map(|&i| &self.items[i]).collect();
        }
        // The names are gone through in the order they are kept in, which is quicker than best first.
        let mut hits: Vec<usize> = (0..self.items.len())
            .filter(|&i| uid == Some(self.items[i].uid()) || words.iter().all(|w| self.folded[i].contains(w.as_str())))
            .collect();
        hits.sort_unstable_by_key(|&i| ranked.place[i]);
        hits.into_iter().map(|i| &self.items[i]).collect()
    }

    /// Every item's place, highest rank first, then by name.
    fn ranked(&self) -> &Ranked {
        self.ranked.get_or_init(|| {
            let mut order: Vec<usize> = (0..self.items.len()).collect();
            order.sort_by(|&a, &b| {
                let (a_item, b_item) = (&self.items[a], &self.items[b]);
                b_item
                    .rank()
                    .cmp(&a_item.rank())
                    .then_with(|| self.sort_names[a].cmp(&self.sort_names[b]))
                    .then_with(|| a_item.display_name().cmp(b_item.display_name()))
                    .then_with(|| a_item.uid().cmp(&b_item.uid()))
            });
            let mut place = vec![0; order.len()];
            for (at, &i) in order.iter().enumerate() {
                place[i] = at;
            }
            Ranked { order, place }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct Item(u32, &'static str, i32);

    impl Listed for Item {
        fn uid(&self) -> u32 {
            self.0
        }
        fn names(&self) -> String {
            self.1.to_owned()
        }
        fn display_name(&self) -> &str {
            self.1
        }
        fn rank(&self) -> i32 {
            self.2
        }
    }

    fn uids(hits: Vec<&Item>) -> Vec<u32> {
        hits.into_iter().map(|item| item.0).collect()
    }

    #[test]
    fn hits_come_best_first_and_follow_an_edit() {
        let mut index = SearchIndex::new(vec![
            Item(1, "Zico", 140),
            Item(2, "Özil", 150),
            Item(3, "Pelé", 150),
            Item(4, "Ada", 90),
        ]);
        // Highest rank first; equal ranks by name, accents aside.
        assert_eq!(uids(index.search("")), [2, 3, 1, 4]);
        assert_eq!(uids(index.search("pele")), [3]);
        assert_eq!(uids(index.search("4")), [4]);
        // An edit that raises a rank moves the item up at the next search.
        assert!(index.update(4, |item| item.2 = 200));
        assert_eq!(uids(index.search("")), [4, 2, 3, 1]);
        assert_eq!(uids(index.search("z")), [2, 1]);
        assert!(!index.update(9, |_| {}));
    }
}
