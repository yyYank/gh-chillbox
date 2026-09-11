package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

type Symbol struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

type Relation struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

type Result struct {
	Symbols   []Symbol   `json:"symbols"`
	Relations []Relation `json:"relations"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: ast-go-parser <file.go>\n")
		os.Exit(1)
	}

	filePath := os.Args[1]
	fset := token.NewFileSet()

	f, err := parser.ParseFile(fset, filePath, nil, parser.ParseComments)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse error: %v\n", err)
		os.Exit(1)
	}

	var symbols []Symbol
	symbolSet := map[string]bool{}

	ast.Inspect(f, func(n ast.Node) bool {
		switch decl := n.(type) {
		case *ast.FuncDecl:
			kind := "function"
			name := decl.Name.Name
			if decl.Recv != nil && len(decl.Recv.List) > 0 {
				kind = "method"
			}
			symbols = append(symbols, Symbol{
				Name:      name,
				Kind:      kind,
				StartLine: fset.Position(decl.Pos()).Line,
				EndLine:   fset.Position(decl.End()).Line,
			})
			symbolSet[name] = true
		case *ast.GenDecl:
			for _, spec := range decl.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					kind := "type"
					switch s.Type.(type) {
					case *ast.InterfaceType:
						kind = "interface"
					case *ast.StructType:
						kind = "struct"
					}
					symbols = append(symbols, Symbol{
						Name:      s.Name.Name,
						Kind:      kind,
						StartLine: fset.Position(s.Pos()).Line,
						EndLine:   fset.Position(s.End()).Line,
					})
					symbolSet[s.Name.Name] = true
				}
			}
		}
		return true
	})

	if symbols == nil {
		symbols = []Symbol{}
	}

	var relations []Relation
	seen := map[string]bool{}

	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}

		line := fset.Position(call.Pos()).Line
		caller := findContainingSymbol(symbols, line)
		if caller == "" {
			return true
		}

		switch fn := call.Fun.(type) {
		case *ast.Ident:
			if symbolSet[fn.Name] && fn.Name != caller {
				key := caller + ":" + fn.Name + ":call"
				if !seen[key] {
					seen[key] = true
					relations = append(relations, Relation{From: caller, To: fn.Name, Kind: "call"})
				}
			}
		case *ast.SelectorExpr:
			methodName := fn.Sel.Name
			if symbolSet[methodName] && methodName != caller {
				key := caller + ":" + methodName + ":method-call"
				if !seen[key] {
					seen[key] = true
					relations = append(relations, Relation{From: caller, To: methodName, Kind: "method-call"})
				}
			}
		}

		return true
	})

	if relations == nil {
		relations = []Relation{}
	}

	result := Result{Symbols: symbols, Relations: relations}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(result); err != nil {
		fmt.Fprintf(os.Stderr, "json error: %v\n", err)
		os.Exit(1)
	}
}

func findContainingSymbol(symbols []Symbol, line int) string {
	for _, sym := range symbols {
		if sym.Kind != "function" && sym.Kind != "method" {
			continue
		}
		if line >= sym.StartLine && line <= sym.EndLine {
			return sym.Name
		}
	}
	return ""
}
