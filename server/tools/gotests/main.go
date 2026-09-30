// gotests は stdin で受け取った Go のテストファイルから、Test/Benchmark/Fuzz 関数と入れ子の Run の名前を抽出して JSON で返す。
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Input struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type Case struct {
	Kind    string   `json:"kind"`
	Names   []string `json:"names"`
	Line    int      `json:"line"`
	Dynamic bool     `json:"dynamic"`
}

type FileResult struct {
	Path  string `json:"path"`
	Cases []Case `json:"cases"`
}

var prefixes = []struct {
	prefix string
	kind   string
}{
	{"Test", "test"},
	{"Benchmark", "benchmark"},
	{"Fuzz", "fuzz"},
}

func main() {
	var inputs []Input
	if err := json.NewDecoder(os.Stdin).Decode(&inputs); err != nil {
		fmt.Fprintf(os.Stderr, "usage: pipe []Input JSON to stdin: %v\n", err)
		os.Exit(1)
	}

	results := make([]FileResult, 0, len(inputs))
	for _, in := range inputs {
		results = append(results, FileResult{Path: in.Path, Cases: extract(in)})
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func extract(in Input) []Case {
	cases := []Case{}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, in.Path, in.Content, 0)
	if err != nil {
		return cases
	}

	e := &extractor{fset: fset, cases: &cases}
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv != nil || fn.Body == nil {
			continue
		}
		kind := testKind(fn.Name.Name)
		param := firstParamName(fn.Type)
		if kind == "" || param == "" {
			continue
		}
		names := []string{fn.Name.Name}
		e.add(kind, names, fn.Pos(), false)
		e.walkRuns(fn.Body, param, kind, names)
	}
	return cases
}

// go test と同じく、接頭辞の直後が小文字のもの（Testhelper など）はテスト関数とみなさない
func testKind(name string) string {
	for _, p := range prefixes {
		if !strings.HasPrefix(name, p.prefix) {
			continue
		}
		rest := name[len(p.prefix):]
		if rest == "" {
			return p.kind
		}
		r, _ := utf8.DecodeRuneInString(rest)
		if !unicode.IsLower(r) {
			return p.kind
		}
	}
	return ""
}

func firstParamName(ft *ast.FuncType) string {
	if ft.Params == nil || len(ft.Params.List) == 0 || len(ft.Params.List[0].Names) == 0 {
		return ""
	}
	return ft.Params.List[0].Names[0].Name
}

type extractor struct {
	fset  *token.FileSet
	cases *[]Case
}

func (e *extractor) add(kind string, names []string, pos token.Pos, dynamic bool) {
	*e.cases = append(*e.cases, Case{
		Kind:    kind,
		Names:   append([]string(nil), names...),
		Line:    e.fset.Position(pos).Line,
		Dynamic: dynamic,
	})
}

// recv.Run(name, func(x *testing.T) {...}) を探し、関数リテラルの中は引数名 x で再帰的に探す
func (e *extractor) walkRuns(body ast.Node, recv, kind string, prefix []string) {
	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok || len(call.Args) != 2 {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != "Run" {
			return true
		}
		if x, ok := sel.X.(*ast.Ident); !ok || x.Name != recv {
			return true
		}

		name, dynamic := e.nameOf(call.Args[0])
		names := append(append([]string(nil), prefix...), name)
		e.add(kind, names, call.Pos(), dynamic)
		if lit, ok := call.Args[1].(*ast.FuncLit); ok {
			if inner := firstParamName(lit.Type); inner != "" {
				e.walkRuns(lit.Body, inner, kind, names)
			}
		}
		return false
	})
}

func (e *extractor) nameOf(expr ast.Expr) (string, bool) {
	if lit, ok := expr.(*ast.BasicLit); ok && lit.Kind == token.STRING {
		if s, err := strconv.Unquote(lit.Value); err == nil {
			return s, false
		}
	}
	var buf bytes.Buffer
	if err := printer.Fprint(&buf, e.fset, expr); err != nil {
		return "?", true
	}
	return buf.String(), true
}
