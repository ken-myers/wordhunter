class CharTrie {
    constructor() {
        this.root = {};
    }

    addWord(word){
        let node = this.root;
        for(let char of word){
            if(!node[char]){
                node[char] = {};
            }
            node = node[char];
        }
        node.isWord = true;
    }
    
    hasWord(word){
        let node = this.root;
        for(let char of word){
            if(!node[char]){
                return false;
            }
            node = node[char];
        }
        return node.isWord === true;
    }

    hasPrefix(prefix){
        let node = this.root;
        for(let char of prefix){
            if(!node[char]){
                return false;
            }
            node = node[char];
        }
        return node !== undefined;
    }
}