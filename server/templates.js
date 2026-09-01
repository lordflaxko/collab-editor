// Every template is deliberately something that actually runs via the
// existing Run/Test panels in this sandbox -- no package manager, no
// servers/ports, since Piston can't do either. FizzBuzz is small, correct,
// and easy to get right in every supported language, which is what a
// starter needs to be more than what it needs to be original. Only the
// JavaScript one ships with a test file, since the built-in Test Runner is
// JavaScript-only today.
const TEMPLATES = {
  javascript: {
    label: 'JavaScript: FizzBuzz starter',
    files: [
      {
        name: 'main.js',
        languageId: 'javascript',
        content: `function fizzbuzz(n) {
  if (n % 15 === 0) return 'FizzBuzz'
  if (n % 3 === 0) return 'Fizz'
  if (n % 5 === 0) return 'Buzz'
  return String(n)
}

if (require.main === module) {
  for (let i = 1; i <= 15; i++) {
    console.log(fizzbuzz(i))
  }
}

module.exports = { fizzbuzz }
`,
      },
      {
        name: 'main.test.js',
        languageId: 'javascript',
        content: `const { test } = require('node:test')
const assert = require('node:assert')
const { fizzbuzz } = require('./main.js')

test('multiples of 3 return Fizz', () => {
  assert.strictEqual(fizzbuzz(3), 'Fizz')
})

test('multiples of 5 return Buzz', () => {
  assert.strictEqual(fizzbuzz(5), 'Buzz')
})

test('multiples of 15 return FizzBuzz', () => {
  assert.strictEqual(fizzbuzz(15), 'FizzBuzz')
})

test('other numbers return themselves', () => {
  assert.strictEqual(fizzbuzz(7), '7')
})
`,
      },
    ],
  },
  typescript: {
    label: 'TypeScript: FizzBuzz starter',
    files: [
      {
        name: 'main.ts',
        languageId: 'typescript',
        content: `function fizzbuzz(n: number): string {
  if (n % 15 === 0) return 'FizzBuzz'
  if (n % 3 === 0) return 'Fizz'
  if (n % 5 === 0) return 'Buzz'
  return String(n)
}

for (let i = 1; i <= 15; i++) {
  console.log(fizzbuzz(i))
}
`,
      },
    ],
  },
  python: {
    label: 'Python: FizzBuzz starter',
    files: [
      {
        name: 'main.py',
        languageId: 'python',
        content: `def fizzbuzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)


if __name__ == "__main__":
    for i in range(1, 16):
        print(fizzbuzz(i))
`,
      },
    ],
  },
  java: {
    label: 'Java: FizzBuzz starter',
    files: [
      {
        name: 'Main.java',
        languageId: 'java',
        content: `public class Main {
    static String fizzbuzz(int n) {
        if (n % 15 == 0) return "FizzBuzz";
        if (n % 3 == 0) return "Fizz";
        if (n % 5 == 0) return "Buzz";
        return String.valueOf(n);
    }

    public static void main(String[] args) {
        for (int i = 1; i <= 15; i++) {
            System.out.println(fizzbuzz(i));
        }
    }
}
`,
      },
    ],
  },
  cpp: {
    label: 'C++: FizzBuzz starter',
    files: [
      {
        name: 'main.cpp',
        languageId: 'cpp',
        content: `#include <iostream>
#include <string>

std::string fizzbuzz(int n) {
    if (n % 15 == 0) return "FizzBuzz";
    if (n % 3 == 0) return "Fizz";
    if (n % 5 == 0) return "Buzz";
    return std::to_string(n);
}

int main() {
    for (int i = 1; i <= 15; i++) {
        std::cout << fizzbuzz(i) << std::endl;
    }
    return 0;
}
`,
      },
    ],
  },
  rust: {
    label: 'Rust: FizzBuzz starter',
    files: [
      {
        name: 'main.rs',
        languageId: 'rust',
        content: `fn fizzbuzz(n: i32) -> String {
    if n % 15 == 0 {
        "FizzBuzz".to_string()
    } else if n % 3 == 0 {
        "Fizz".to_string()
    } else if n % 5 == 0 {
        "Buzz".to_string()
    } else {
        n.to_string()
    }
}

fn main() {
    for i in 1..=15 {
        println!("{}", fizzbuzz(i));
    }
}
`,
      },
    ],
  },
  go: {
    label: 'Go: FizzBuzz starter',
    files: [
      {
        name: 'main.go',
        languageId: 'go',
        content: `package main

import (
	"fmt"
	"strconv"
)

func fizzbuzz(n int) string {
	if n%15 == 0 {
		return "FizzBuzz"
	} else if n%3 == 0 {
		return "Fizz"
	} else if n%5 == 0 {
		return "Buzz"
	}
	return strconv.Itoa(n)
}

func main() {
	for i := 1; i <= 15; i++ {
		fmt.Println(fizzbuzz(i))
	}
}
`,
      },
    ],
  },
}

module.exports = { TEMPLATES }
